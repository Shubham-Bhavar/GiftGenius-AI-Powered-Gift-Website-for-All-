import { Field } from '../common/ui.jsx';
import { titleCase } from '../../utils/format.js';
import { INDIAN_STATES } from '../../constants/india.js';
import { SELLER_CATEGORIES } from '../../constants/marketplace.js';
import { MARKUP_RE, PINCODE_RE, SELLER_PHONE_RE } from '../../utils/validation.js';

/**
 * A store's details (name, category, description, phone, address) as form fields in the site's form style.
 * Used to open a store from the account page and in the Seller Center's store settings.
 */
export default function StoreFormFields({ values, errors = {}, onChange, idPrefix = 'store' }) {
  const set = (k) => (e) => onChange(k, e.target.value);
  return (
    <>
      <div className="co-form-row">
        <Field id={`${idPrefix}-name`} label="Store Name" required maxLength={80} autoComplete="organization" value={values.storeName}
          onChange={set('storeName')} error={errors.storeName} />
        <Field id={`${idPrefix}-category`} label="What You Sell" as="select" required value={values.businessCategory}
          onChange={set('businessCategory')} error={errors.businessCategory}>
          <option value="">Choose a category…</option>
          {SELLER_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
        </Field>
      </div>
      <div className="co-form-row full">
        <Field id={`${idPrefix}-description`} label="Store Description (optional)" as="textarea" rows={3} maxLength={1000}
          value={values.description} onChange={set('description')} error={errors.description}
          hint="Shown on your public store page." />
      </div>
      <div className="co-form-row">
        <Field id={`${idPrefix}-phone`} label="Phone" type="tel" required autoComplete="tel" value={values.phone}
          onChange={set('phone')} error={errors.phone} placeholder="+91 98765 43210" hint="For GiftGenius to reach you. Never shown to shoppers." />
        <Field id={`${idPrefix}-address`} label="Business Address" required maxLength={300} autoComplete="street-address"
          value={values.addressLine} onChange={set('addressLine')} error={errors.addressLine} />
      </div>
      <div className="co-form-row co-form-row--3">
        <Field id={`${idPrefix}-city`} label="City" required maxLength={80} autoComplete="address-level2" value={values.city}
          onChange={set('city')} error={errors.city} />
        <Field id={`${idPrefix}-state`} label="State" as="select" required autoComplete="address-level1" value={values.state}
          onChange={set('state')} error={errors.state}>
          <option value="">Choose…</option>
          {INDIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
        </Field>
        <Field id={`${idPrefix}-pincode`} label="PIN Code" required inputMode="numeric" maxLength={6} autoComplete="postal-code"
          value={values.pincode} onChange={set('pincode')} error={errors.pincode} />
      </div>
    </>
  );
}

// ── The store's rules (sign-up, "Start selling" and Store Settings share them) ──

/** The store fields collected when someone signs up as a seller (also used by "Start selling" in Account). */
export const EMPTY_STORE = { storeName: '', businessCategory: '', description: '', addressLine: '', city: '', state: '', pincode: '' };

/** Checks a seller's store details with the API's rules. Returns { field: message }. */
export function validateStore(store, phone) {
  const errors = {};
  const name = store.storeName.trim();
  if (!name) errors.storeName = 'Enter your store name.';
  else if (name.length < 2 || name.length > 80) errors.storeName = 'Use 2 to 80 characters.';
  if (!store.businessCategory) errors.businessCategory = 'Choose what you sell.';
  if (!phone.trim()) errors.phone = 'Enter a phone number so we can reach you about orders.';
  else if (!SELLER_PHONE_RE.test(phone.trim())) errors.phone = 'Enter a valid phone number, like +91 98765 43210.';
  if (!store.addressLine.trim()) errors.addressLine = 'Enter your business address.';
  if (!store.city.trim()) errors.city = 'Enter the city.';
  if (!store.state) errors.state = 'Choose the state.';
  if (!PINCODE_RE.test(store.pincode.trim())) errors.pincode = 'Enter a 6-digit PIN code.';
  if (store.description.length > 1000) errors.description = 'Use at most 1000 characters.';
  ['storeName', 'description', 'addressLine', 'city'].forEach((k) => {
    if (!errors[k] && MARKUP_RE.test(store[k])) errors[k] = 'Remove the < and > characters.';
  });
  return errors;
}

/** The store part of a sign-up or "Start selling" request. */
export const storeBody = (store, phone) => ({
  storeName: store.storeName.trim(), businessCategory: store.businessCategory, description: store.description.trim() || undefined,
  phone: phone.trim(), addressLine: store.addressLine.trim(), city: store.city.trim(), state: store.state, pincode: store.pincode.trim(),
});

/** API field errors for the store come back as "seller.storeName"; the form's fields are "storeName". */
export function storeErrors(errors = {}) {
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k.replace(/^seller\./, ''), v]));
}
