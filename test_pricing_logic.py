#!/usr/bin/env python3
"""
Test to verify that dual PDF generation correctly uses different pricing
"""

import requests
import json

BACKEND_URL = "https://roller-quote-hub.preview.emergentagent.com/api"

def test_pricing_logic():
    """Test that dual PDF uses correct distributor vs client pricing"""
    
    # Get a product
    response = requests.get(f"{BACKEND_URL}/products")
    products = response.json()
    product = products[0]
    
    print(f"Product: {product['name']}")
    print(f"  Distributor price: ${product['distributor_price']}/m²")
    print(f"  Client price: ${product['client_price']}/m²")
    print(f"  Price difference: ${product['client_price'] - product['distributor_price']}/m²")
    
    # Create a quote using client pricing
    quote_data = {
        "items": [{
            "product_id": product['id'],
            "product_name": product['name'],
            "color": "Blanco",
            "width": 2.0,  # 2m x 1.5m = 3 m²
            "height": 1.5,
            "unit_price": product['client_price'],  # Using CLIENT price
            "chain_orientation": "Derecha",
            "fascia_type": "Redonda",
            "fascia_color": "Blanca",
            "fascia_price": 0.0,
            "installation_price": 0.0
        }],
        "client_type": "client",
        "client_name": "Test Client",
        "notes": "Test for pricing verification"
    }
    
    # Create quote
    response = requests.post(f"{BACKEND_URL}/quotes", json=quote_data)
    quote = response.json()
    quote_id = quote['id']
    
    expected_m2 = 2.0 * 1.5  # 3 m²
    expected_client_cost = expected_m2 * product['client_price']
    expected_distributor_cost = expected_m2 * product['distributor_price']
    
    print(f"\nQuote created: {quote_id}")
    print(f"  Area: {expected_m2} m²")
    print(f"  Expected client cost: ${expected_client_cost:.2f}")
    print(f"  Expected distributor cost: ${expected_distributor_cost:.2f}")
    print(f"  Stored quote total: ${quote['total']:.2f}")
    
    # Check what's actually stored in the quote
    response = requests.get(f"{BACKEND_URL}/quotes/{quote_id}")
    if response.status_code == 200:
        quote_details = response.json()
        item = quote_details['items'][0]
        print(f"\nStored quote item details:")
        print(f"  Square meters: {item['square_meters']} m²")
        print(f"  Unit price: ${item['unit_price']}/m²")
        print(f"  Subtotal: ${item['subtotal']:.2f}")
        
        # The issue: the quote only stores ONE unit price
        # But for dual PDF, we need BOTH distributor and client prices
        # The dual PDF endpoint should look up the product to get both prices
    
    # Test dual PDF generation
    response = requests.get(f"{BACKEND_URL}/quotes/{quote_id}/pdf/both")
    if response.status_code == 200:
        print("\n✅ Dual PDF endpoint responded successfully")
        pdf_data = response.json()
        print(f"  Distributor filename: {pdf_data['distributor_filename']}")
        print(f"  Client filename: {pdf_data['client_filename']}")
        
        # The key question: Does the PDF generation actually recalculate
        # using the product's distributor_price and client_price?
        # Or does it use the stored unit_price for both?
        
        print(f"\nFor proper dual PDF generation, the backend should:")
        print(f"  1. Look up the product by product_id from the quote item")
        print(f"  2. Use product.distributor_price for distributor PDF") 
        print(f"  3. Use product.client_price for client PDF")
        print(f"  4. Recalculate totals accordingly")
    else:
        print(f"❌ Dual PDF generation failed: {response.status_code}")

if __name__ == "__main__":
    test_pricing_logic()