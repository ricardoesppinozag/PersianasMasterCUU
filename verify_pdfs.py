#!/usr/bin/env python3
import base64
import requests

# Get the quote ID from the last test
response = requests.get('https://roller-quote-hub.preview.emergentagent.com/api/quotes')
quotes = response.json()
latest_quote = quotes[0]  # Most recent
quote_id = latest_quote['id']

print(f'Testing quote {quote_id}')
print(f'Quote total in DB: ${latest_quote["total"]}')
print(f'Quote items: {len(latest_quote["items"])}')

# Get both PDFs
response = requests.get(f'https://roller-quote-hub.preview.emergentagent.com/api/quotes/{quote_id}/pdf/both')
pdf_data = response.json()

# Save both PDFs with detailed names
dist_pdf = base64.b64decode(pdf_data['distributor_pdf_base64'])
client_pdf = base64.b64decode(pdf_data['client_pdf_base64'])

with open('/app/distributor_detailed.pdf', 'wb') as f:
    f.write(dist_pdf)
with open('/app/client_detailed.pdf', 'wb') as f:
    f.write(client_pdf)

print(f'Distributor PDF: {len(dist_pdf)} bytes - {pdf_data["distributor_filename"]}')
print(f'Client PDF: {len(client_pdf)} bytes - {pdf_data["client_filename"]}')
print(f'PDFs are different: {dist_pdf != client_pdf}')

# Check the products to see the pricing difference
products_response = requests.get('https://roller-quote-hub.preview.emergentagent.com/api/products')
products = products_response.json()
product_used = None
for item in latest_quote['items']:
    for product in products:
        if product['id'] == item['product_id']:
            product_used = product
            break
    if product_used:
        break

if product_used:
    print(f"Product used: {product_used['name']}")
    print(f"Distributor price: ${product_used['distributor_price']}/m²")
    print(f"Client price: ${product_used['client_price']}/m²")
    
    item = latest_quote['items'][0]
    sqm = item['square_meters']
    expected_dist_total = sqm * product_used['distributor_price']
    expected_client_total = sqm * product_used['client_price']
    
    print(f"Square meters: {sqm}")
    print(f"Expected distributor total: ${expected_dist_total}")
    print(f"Expected client total: ${expected_client_total}")
    print(f"Pricing difference: ${expected_client_total - expected_dist_total}")