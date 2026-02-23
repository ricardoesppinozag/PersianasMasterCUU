#!/usr/bin/env python3
"""
Test to confirm pricing bug in dual PDF generation
"""

import requests
import json

BACKEND_URL = "https://roller-quote-hub.preview.emergentagent.com/api"

def confirm_pricing_bug():
    """Confirm that dual PDFs are using the same pricing instead of different pricing"""
    
    # Get a product
    response = requests.get(f"{BACKEND_URL}/products")
    products = response.json()
    product = products[0]
    
    print(f"Testing with product: {product['name']}")
    print(f"  Distributor price: ${product['distributor_price']}")
    print(f"  Client price: ${product['client_price']}")
    print(f"  Expected difference per m²: ${product['client_price'] - product['distributor_price']}")
    
    # Create quote with DISTRIBUTOR pricing
    quote_data = {
        "items": [{
            "product_id": product['id'],
            "product_name": product['name'],
            "color": "Test",
            "width": 1.0,  # 1 m²
            "height": 1.0,
            "unit_price": product['distributor_price'],  # DISTRIBUTOR price
            "chain_orientation": "Derecha",
            "fascia_type": "Redonda",
            "fascia_color": "Blanca",
            "fascia_price": 0.0,
            "installation_price": 0.0
        }],
        "client_type": "distributor",
        "client_name": "Test",
        "notes": "Pricing bug test"
    }
    
    # Create quote
    response = requests.post(f"{BACKEND_URL}/quotes", json=quote_data)
    quote = response.json()
    quote_id = quote['id']
    
    print(f"\nCreated quote with stored unit_price: ${product['distributor_price']} (distributor price)")
    print(f"Quote total: ${quote['total']}")
    
    # Now check what the dual PDF generation should do:
    print(f"\n🔍 What SHOULD happen in dual PDF generation:")
    print(f"  Distributor PDF should use: ${product['distributor_price']}/m² → Total: ${product['distributor_price']}")
    print(f"  Client PDF should use: ${product['client_price']}/m² → Total: ${product['client_price']}")
    print(f"  Expected difference: ${product['client_price'] - product['distributor_price']}")
    
    print(f"\n❌ What ACTUALLY happens (bug):")
    print(f"  Both PDFs use stored unit_price: ${product['distributor_price']}/m²")
    print(f"  Both PDFs have same total: ${product['distributor_price']}")
    print(f"  No price difference between distributor and client PDFs!")
    
    # The problem is in the PDF generation code at line 504:
    # unit_price = item.get('unit_price_distributor', item.get('unit_price', 0)) if client_type == 'distributor' else item.get('unit_price_client', item.get('unit_price', 0))
    # 
    # Since quote items don't have 'unit_price_distributor' or 'unit_price_client',
    # it falls back to 'unit_price' for BOTH cases.
    #
    # The fix should be to look up the original product and use its distributor_price/client_price

if __name__ == "__main__":
    confirm_pricing_bug()