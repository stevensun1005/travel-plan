"""Convert every platform quote to the trip currency and make each option use its cheapest available quote.

A budget option may carry `quotes`: one entry per platform for the SAME product (same flight and fare
conditions, same room, nights, guests, taxes included):

    "quotes": [
      {"platform": "Trip.com", "amount": 2062, "currency": "CAD", "checkedOn": "2026-11-15", "url": "...", "note": "..."},
      {"platform": "携程", "amount": 11104, "currency": "CNY", "checkedOn": "2026-11-15"},
      {"platform": "Expedia", "available": false, "note": "没有直飞"}
    ]

This script writes `converted` (trip currency) on every available quote, sorts them cheapest first,
and sets the option's `amount` and `source` from the cheapest one. Exchange rates live in
`fx = {"base": "CAD", "date": ..., "source": ..., "rates": {"USD": 1.4257, ...}}` (1 unit = rate × base).
`--fetch-fx` fills them from the Bank of Canada when the trip currency is CAD; for other trip
currencies, put the rates in `fx.rates` yourself from that currency's central bank.
"""
import argparse
import json
import sys
import urllib.request
from pathlib import Path

BOC = 'https://www.bankofcanada.ca/valet/observations/{series}/json?recent=1'


def currencies_needed(data, base):
    found = set()
    for category in data.get('budget', {}).get('categories', []):
        for option in category.get('options', []):
            for quote in option.get('quotes') or []:
                currency = (quote.get('currency') or base).upper()
                if quote.get('available', True) and currency != base:
                    found.add(currency)
    return sorted(found)


def fetch_boc(codes):
    series = ','.join(f'FX{code}CAD' for code in codes)
    with urllib.request.urlopen(BOC.format(series=series), timeout=20) as response:
        payload = json.load(response)
    row = payload['observations'][-1]
    return row['d'], {code: float(row[f'FX{code}CAD']['v']) for code in codes}


def apply(data, fetch=False):
    base = (data.get('trip', {}).get('currency') or 'CAD').upper()
    fx = data.setdefault('fx', {'base': base, 'rates': {}})
    if fx.get('base', base).upper() != base:
        raise SystemExit(f'fx.base is {fx.get("base")}, but the trip currency is {base}')
    fx['base'] = base
    needed = currencies_needed(data, base)
    if fetch and needed:
        if base != 'CAD':
            raise SystemExit('--fetch-fx only knows Bank of Canada rates (trip currency CAD). Fill fx.rates by hand.')
        date, rates = fetch_boc(needed)
        fx.setdefault('rates', {}).update(rates)
        fx['date'] = date
        fx['source'] = 'Bank of Canada'
    missing = [code for code in needed if code not in fx.get('rates', {})]
    if missing:
        raise SystemExit(f'Missing exchange rates for {", ".join(missing)} (run with --fetch-fx or fill fx.rates)')
    changed = []
    for category in data.get('budget', {}).get('categories', []):
        for option in category.get('options', []):
            quotes = option.get('quotes')
            if not quotes:
                continue
            for quote in quotes:
                if not quote.get('available', True):
                    quote.pop('converted', None)
                    continue
                currency = (quote.get('currency') or base).upper()
                quote['currency'] = currency
                rate = 1 if currency == base else fx['rates'][currency]
                quote['converted'] = round(quote['amount'] * rate, 2)
            live = [q for q in quotes if q.get('available', True)]
            quotes.sort(key=lambda q: (not q.get('available', True), q.get('converted', 0)))
            if not live:
                continue
            best = min(live, key=lambda q: q['converted'])
            if option.get('amount') != best['converted'] or option.get('source') != best['platform']:
                changed.append(f'{category["id"]}/{option["id"]}: {option.get("amount")} -> {best["converted"]} ({best["platform"]})')
            option['amount'] = best['converted']
            option['source'] = best['platform']
            if best.get('url'):
                option['url'] = best['url']
    return changed


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('trip', help='trip folder containing trip-data.json')
    parser.add_argument('--fetch-fx', action='store_true', help='refresh exchange rates from the Bank of Canada (CAD trips)')
    args = parser.parse_args()
    path = Path(args.trip) / 'trip-data.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    changed = apply(data, fetch=args.fetch_fx)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    fx = data.get('fx', {})
    if fx.get('rates'):
        print(f'Rates ({fx.get("source", "manual")}, {fx.get("date", "?")}): ' + ', '.join(f'1 {k} = {v} {fx["base"]}' for k, v in fx['rates'].items()))
    print('\n'.join(changed) if changed else 'Options already use their cheapest quote.')


if __name__ == '__main__':
    sys.exit(main())
