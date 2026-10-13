# Controlled AI tools: design

Status: **design only**. Nothing here is implemented or enabled. This describes how GiftGenius could let the model
ask for catalogue data during a conversation (tool calling) without giving it any power beyond reading the public
shop.

## Why, and the rules that don't bend

Today the model never acts: the server gathers real products (the recommendation engine), asks the model to reorder
and explain them, and validates every id it returns against that shortlist. Tool calling would let the model ask
follow-up questions of the catalogue ("show me cultural gifts under 800") inside one answer. The same guarantees
must hold:

1. **The server executes, the model only asks.** A tool call is a request in the model's reply. The server checks
   it against a fixed allow-list, validates the arguments, runs it, and returns the result as data.
2. **Read-only, public data only.** Exactly four tools, all reading the public, purchasable catalogue. No database
   access of its own, no files, no shell, no network, no payments, no orders, carts, accounts, addresses, emails or
   seller-private data, and nothing that writes.
3. **No identity.** Tools run as an anonymous shopper, whoever is signed in. They can't see or change user data.
4. **Bounded.** At most 5 tool calls per request, each with a 1 second timeout and capped output. Every model turn
   counts against the existing AI budget (`AI_DAILY_CALL_LIMIT`) and the per-IP AI rate limit.
5. **Everything returned is still validated.** The final answer passes `AiOutputValidator`: product ids must come
   from tool results in this request (the allow-list), text is cleaned, and links or markup are dropped.
6. **Always a fallback.** If tools are off, fail, or the loop hits its limits, the rules-based answer is returned
   (as now).

## The four tools

All inputs use the same validation as the quiz: plain words for choices (`^[\p{L}\p{M} &'-]{1,30}$`), bounded
numbers and lists. Unknown fields are rejected. Outputs are new, minimal records rather than `ProductDto`: nothing
seller-private or internal goes to the model, and seller-written text is flattened and shortened as in today's
prompts.

### `searchProducts`

Find purchasable products by words and a budget. Backed by `search.service.SearchService`.

| Input | Type | Rules |
|---|---|---|
| `query` | string | required, 1–200 characters, control characters removed |
| `budgetMax` | integer | optional, 1–1,000,000 (rupees) |
| `category` | string | optional, one of the catalogue categories |
| `limit` | integer | optional, 1–10, default 5 |

Output: `{ "results": [ { "productId", "name", "category", "price", "rating", "reviewCount" } ] }`, best first.

### `getProductDetails`

One purchasable product. Backed by `ProductService.get` plus the purchasable check (listed, approved, in stock);
anything else is "not found".

| Input | Type | Rules |
|---|---|---|
| `productId` | integer | required, positive |

Output: `{ "productId", "name", "category", "price", "originalPrice", "rating", "reviewCount", "tags": [],
"occasions": [], "description" }`. The description is cut to 400 characters and flattened to one line.

### `getRecommendations`

The deterministic engine. Backed by `RecommendationService` through `PreferenceNormalizer`.

| Input | Type | Rules |
|---|---|---|
| `recipient`, `occasion`, `personality` | string | optional, plain words |
| `budget` | integer | optional, 1–1,000,000 |
| `interests` | string[] | optional, at most 3 plain words |
| `limit` | integer | optional, 1–8, default 4 |

Output: `{ "outcome": "MATCHED" | "TOP_RATED" | "NOTHING_IN_BUDGET" | "CATALOG_EMPTY", "picks": [ { "productId",
"name", "price", "reason" } ] }`.

### `getCategories`

No input. Backed by `ProductService.categories`. Output: `{ "categories": [ { "name", "count" } ] }`.

## Shape in code (proposed)

```java
/** One read-only capability the model may ask for. I and O are records with Bean Validation annotations. */
interface AiTool<I, O> {
    String name();                 // "searchProducts"
    Class<I> inputType();
    String description();          // shown to the model
    O call(I input);               // only ever called with validated input
}

/** The only way a tool runs. */
final class ToolGateway {
    // Immutable registry: the four tools above, nothing else.
    // run(name, jsonArguments):
    //   1. unknown name -> rejected (and the request falls back to rules)
    //   2. parse arguments strictly into I (unknown fields fail), then Bean Validation
    //   3. per-request call counter (max 5) and 1 s timeout
    //   4. call, then serialise O; log the tool name and outcome only, never arguments that could hold personal text
}
```

The loop lives in `AiOrchestrator`: send the prompt with the tool declarations → while the model asks for tools
(and limits allow), run them through the gateway and send the results back as data → validate the final answer
against the ids the tools returned. Gemini's function calling maps directly: each tool becomes a
`functionDeclaration` whose JSON Schema is generated from the input record.

## Prompt-injection posture

- Tool results are data. Seller-written text in them is flattened (no line breaks, tags or column separators) and
  shortened, as today.
- The system prompt states that tool results and shopper text are never instructions.
- Even a fully misled model can only read the public catalogue and propose ids that are then checked. It has no tool
  that could change anything or reach anyone's data.

## Tests to add with the implementation

- Each tool: valid input, every invalid input (wrong types, out of range, unknown fields, non-plain words), and an
  output with no non-public fields.
- Gateway: unknown tool, too many calls, timeouts, a tool that throws; each falls back to rules.
- Orchestrator: a model that requests ids it never saw (rejected); seller text trying to inject tool calls; the
  budget running out mid-loop.

## Rollout

Behind `AI_TOOLS_ENABLED` (default `false`), on top of `AI_ENABLED` and a configured key. With it off, behaviour is
exactly today's.
