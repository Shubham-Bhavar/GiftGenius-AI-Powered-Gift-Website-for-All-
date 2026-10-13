package com.giftgenius.search.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import com.giftgenius.analytics.InteractionEvent;
import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.common.ApiException;
import com.giftgenius.common.PageResponse;
import com.giftgenius.recommendation.engine.CandidateGenerator;
import com.giftgenius.recommendation.engine.PopularitySignals;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;
import com.giftgenius.recommendation.engine.ProductScorer;
import com.giftgenius.recommendation.engine.TextPreferenceParser;
import com.giftgenius.recommendation.engine.TextPreferenceParser.Parsed;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.search.dto.SearchDtos.Interpreted;
import com.giftgenius.search.dto.SearchDtos.SearchHit;
import com.giftgenius.search.dto.SearchDtos.SearchResponse;

/**
 * Search that understands gift requests as well as product words. "birthday gift for mom under 1500" is read for a
 * budget, an occasion and a recipient; "rose bouquet" matches product names and categories; most queries are both.
 * <p>
 * Deterministic and AI-free: the query is read by the rules {@link TextPreferenceParser}; results come only from
 * what can be bought right now; a stated budget is a hard limit (with the engine's tolerance). A product is a result
 * when it matches a keyword or fits what was asked, and results are ranked by keyword relevance plus the
 * recommendation engine's fit and quality points. It runs in memory over the cached purchasable catalogue, which
 * suits today's catalogue; a search index is the step for a much larger one.
 */
@Service
public class SearchService {

    static final int MAX_QUERY = 200;
    static final int MAX_SIZE = 50;
    private static final int MAX_KEYWORDS = 8;

    /** Points per keyword, by where it matches (the best place counts, once). */
    private static final double IN_NAME = 20;
    private static final double IN_CATEGORY_OR_TAGS = 12;
    private static final double IN_GIFT_DETAILS = 8;
    private static final double IN_DESCRIPTION = 4;

    private static final Pattern NOT_A_WORD = Pattern.compile("[^\\p{L}\\p{N}&'-]+");
    private static final Set<String> STOPWORDS = Set.of("a", "an", "the", "for", "my", "our", "to", "of", "and", "or",
            "with", "gift", "gifts", "something", "some", "under", "below", "within", "upto", "up", "less", "than",
            "max", "maximum", "budget", "around", "about", "is", "in", "on", "at", "as", "it", "be", "from", "her",
            "his", "him", "she", "he", "they", "their", "them", "me", "i", "want", "need", "looking", "find", "buy",
            "nice", "good", "rs", "inr", "rupees", "that", "this", "who", "loves", "love", "likes", "like", "k");
    private static final Comparator<SearchHit> BEST_FIRST = Comparator.comparingDouble(SearchHit::score).reversed()
            .thenComparing(h -> h.product().rating(), Comparator.reverseOrder())
            .thenComparing(h -> h.product().reviewCount(), Comparator.reverseOrder())
            .thenComparing(h -> h.product().id());

    private final CandidateGenerator candidates;
    private final ProductScorer scorer;
    private final PopularitySignals popularity;
    private final TextPreferenceParser parser;
    private final PreferenceNormalizer normalizer;
    private final ApplicationEventPublisher events;

    public SearchService(CandidateGenerator candidates, ProductScorer scorer, PopularitySignals popularity,
            TextPreferenceParser parser, PreferenceNormalizer normalizer, ApplicationEventPublisher events) {
        this.candidates = candidates;
        this.scorer = scorer;
        this.popularity = popularity;
        this.parser = parser;
        this.normalizer = normalizer;
        this.events = events;
    }

    public SearchResponse search(String query, int page, int size) {
        String q = query == null ? "" : query.strip();
        if (q.isEmpty()) {
            throw ApiException.badRequest("Type something to search for.");
        }
        if (q.length() > MAX_QUERY) {
            throw ApiException.badRequest("Keep your search under " + MAX_QUERY + " characters.");
        }
        Parsed parsed = parser.parse(q);
        GiftPreferences prefs = normalizer.normalize(parsed.recipient(), parsed.occasion(), parsed.budget(),
                parsed.interests(), parsed.personality());
        List<Pattern> keywords = keywords(q).stream().map(SearchService::wholeWord).toList();

        List<SearchHit> hits = new ArrayList<>();
        for (ProductDto p : candidates.candidates(candidates.catalog(), prefs)) {
            double text = relevance(p, keywords);
            ScoredProduct fit = scorer.score(p, prefs, popularity.of(p.id()), 0);
            if (text > 0 || fit.fits()) {
                hits.add(new SearchHit(p, text + fit.score()));
            }
        }
        hits.sort(BEST_FIRST);

        int pageSize = Math.min(Math.max(size, 1), MAX_SIZE);
        int from = (int) Math.min((long) Math.max(page, 0) * pageSize, hits.size());
        List<SearchHit> shown = hits.subList(from, Math.min(from + pageSize, hits.size()));
        PageResponse<SearchHit> results = new PageResponse<>(List.copyOf(shown), Math.max(page, 0), pageSize,
                hits.size(), (hits.size() + pageSize - 1) / pageSize);
        events.publishEvent(InteractionEvent.search(q, shown.stream().map(h -> h.product().id()).toList()));
        return new SearchResponse(q, new Interpreted(prefs.recipient(), prefs.occasion(),
                prefs.hasBudget() ? prefs.budget() : null, prefs.interests(), prefs.personality(), keywords(q)), results);
    }

    /** The query's words worth matching: no stopwords, numbers or single letters; each once, at most eight. */
    static List<String> keywords(String query) {
        Set<String> out = new LinkedHashSet<>();
        for (String w : NOT_A_WORD.split(query.toLowerCase(Locale.ROOT))) {
            String word = w.replaceAll("^['&-]+|['&-]+$", "").replaceAll("'s$", "");
            if (word.length() > 1 && !STOPWORDS.contains(word) && word.chars().noneMatch(Character::isDigit)) {
                out.add(word);
            }
        }
        return out.stream().limit(MAX_KEYWORDS).toList();
    }

    /** Each keyword scores once, where it matches best: name, then category or tags, then gift details, then text. */
    private static double relevance(ProductDto p, List<Pattern> keywords) {
        double total = 0;
        for (Pattern k : keywords) {
            if (k.matcher(p.name().toLowerCase(Locale.ROOT)).find()) {
                total += IN_NAME;
            } else if (k.matcher(p.category()).find() || p.tags().stream().anyMatch(t -> k.matcher(t).find())) {
                total += IN_CATEGORY_OR_TAGS;
            } else if (anyMatches(k, p.occasion()) || anyMatches(k, p.relationship()) || anyMatches(k, p.forWhom())
                    || anyMatches(k, p.personality())) {
                total += IN_GIFT_DETAILS;
            } else if (p.description() != null && k.matcher(p.description().toLowerCase(Locale.ROOT)).find()) {
                total += IN_DESCRIPTION;
            }
        }
        return total;
    }

    private static boolean anyMatches(Pattern k, List<String> values) {
        return values.stream().anyMatch(v -> k.matcher(v).find());
    }

    /** The word itself, or with a trailing "s" either way ("mug" finds "mugs", "roses" finds "rose"). */
    private static Pattern wholeWord(String word) {
        String stem = word.length() > 3 && word.endsWith("s") ? word.substring(0, word.length() - 1) : word;
        return Pattern.compile("(?<![\\p{L}\\p{N}])" + Pattern.quote(stem) + "s?(?![\\p{L}\\p{N}])");
    }
}
