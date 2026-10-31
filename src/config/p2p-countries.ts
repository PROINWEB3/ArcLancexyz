/**
 * P2P countries and payment methods. This is the only place the list lives.
 *
 * The contract stores `paymentMethods` as a bitmask (1 to 63). Bit `i` means the method at index `i` of the
 * country's list below, so the order of each list must never change once ads exist. Keep each list at 6 or fewer.
 */
export type P2PCurrency = 'PKR' | 'INR' | 'BDT' | 'NGN'

export interface P2PCountry {
  code: string
  name: string
  currency: P2PCurrency
  methods: readonly string[]
}

export const P2P_COUNTRIES: readonly P2PCountry[] = [
  { code: 'PK', name: 'Pakistan', currency: 'PKR', methods: ['JazzCash', 'Easypaisa', 'Raast', 'SadaPay', 'NayaPay', 'Bank Transfer'] },
  { code: 'IN', name: 'India', currency: 'INR', methods: ['UPI', 'PhonePe', 'Google Pay', 'Paytm', 'Bank Transfer (IMPS)'] },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', methods: ['bKash', 'Nagad', 'Rocket', 'Bank Transfer'] },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', methods: ['Bank Transfer', 'Opay', 'PalmPay', 'Moniepoint'] },
]

export const P2P_DEMO_NOTICE = 'Testnet demo: do not use real account details'

export const getCountry = (code: string): P2PCountry => P2P_COUNTRIES.find((c) => c.code === code) ?? P2P_COUNTRIES[0]
export const countryOfCurrency = (currency: string): P2PCountry => P2P_COUNTRIES.find((c) => c.currency === currency) ?? P2P_COUNTRIES[0]

/** Bit value of one method (by index in the country's list). */
export const methodBit = (index: number): number => 1 << index

/** Method names that are set in a bitmask, for the country that uses this currency. */
export function methodsFromMask(currency: string, mask: number): string[] {
  return countryOfCurrency(currency).methods.filter((_, i) => (mask & methodBit(i)) !== 0)
}
