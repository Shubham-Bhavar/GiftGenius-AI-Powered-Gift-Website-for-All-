import { Field } from './ui.jsx';
import { titleCase } from '../lib/format.js';
import { INDIAN_STATES } from '../lib/india.js';
import { SELLER_CATEGORIES } from '../lib/marketplace.js';

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
