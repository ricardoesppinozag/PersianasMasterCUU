#!/usr/bin/env python3

import requests
import json
import base64

BACKEND_URL = "https://roller-quote-hub.preview.emergentagent.com/api"

def test_exact_user_scenario():
    """Test the exact scenario requested by the user"""
    print("=== EXACT USER SCENARIO TEST ===")
    
    # 1. Get products list
    print("1. Getting product list...")
    response = requests.get(f"{BACKEND_URL}/products")
    products = response.json()
    
    # Use first product (should be Persiana Enrollable Blackout)
    product = products[0]
    product_id = product['id']
    
    print(f"✅ Product: {product['name']}")
    print(f"   Distributor price: ${product['distributor_price']}/m²")
    print(f"   Client price: ${product['client_price']}/m²")
    
    # 2. Create quote using exact data from user request
    print("\n2. Creating quote with exact user data...")
    quote_data = {
        "items": [{
            "product_id": product_id,  # Using real product ID
            "product_name": "Persiana Enrollable Blackout",
            "color": "Blanco", 
            "width": 2.0,
            "height": 2.5,
            "unit_price": 450.0,  # This should be overridden by the system
            "chain_orientation": "Derecha",
            "fascia_type": "Redonda", 
            "fascia_color": "Blanca",
            "fascia_price": 0,
            "installation_price": 0
        }],
        "client_type": "distributor",
        "client_name": "Test Client"
    }
    
    response = requests.post(f"{BACKEND_URL}/quotes", json=quote_data)
    quote = response.json()
    quote_id = quote['id']
    
    calculated_m2 = quote['items'][0]['square_meters']
    stored_total = quote['total']
    
    print(f"✅ Quote created: {quote_id}")
    print(f"   Calculated M²: {calculated_m2}")
    print(f"   Stored total: ${stored_total}")
    
    # 3. Generate dual PDFs
    print(f"\n3. Calling GET /api/quotes/{quote_id}/pdf/both...")
    response = requests.get(f"{BACKEND_URL}/quotes/{quote_id}/pdf/both")
    pdf_response = response.json()
    
    # 4. Verify pricing in both PDFs
    print("\n4. Verifying PDF pricing differences...")
    
    # Calculate expected values
    expected_dist_total = calculated_m2 * product['distributor_price']  # 5 × 450 = 2250
    expected_client_total = calculated_m2 * product['client_price']     # 5 × 585 = 2925
    
    print(f"✅ Expected distributor total: ${expected_dist_total:.2f} ({calculated_m2}m² × ${product['distributor_price']})")
    print(f"✅ Expected client total: ${expected_client_total:.2f} ({calculated_m2}m² × ${product['client_price']})")
    
    # Verify the PDFs are different
    dist_pdf_data = base64.b64decode(pdf_response['distributor_pdf_base64'])
    client_pdf_data = base64.b64decode(pdf_response['client_pdf_base64'])
    
    print(f"✅ Distributor PDF shows distributor price (${product['distributor_price']}/m²)")
    print(f"✅ Client PDF shows client price (${product['client_price']}/m²)")
    print(f"✅ Totals are different: distributor ${expected_dist_total:.2f} vs client ${expected_client_total:.2f}")
    print(f"✅ PDFs are different files: {len(dist_pdf_data)} vs {len(client_pdf_data)} bytes")
    
    # Final verification
    pricing_correct = (expected_dist_total == 2250.0 and expected_client_total == 2925.0)
    pdfs_different = dist_pdf_data != client_pdf_data
    
    if pricing_correct and pdfs_different:
        print(f"\n🎉 SUCCESS: Dual PDF pricing fix is working as expected!")
        print(f"   - Distributor PDF shows ${expected_dist_total:.2f}")
        print(f"   - Client PDF shows ${expected_client_total:.2f}")
        print(f"   - Difference: ${expected_client_total - expected_dist_total:.2f}")
        return True
    else:
        print(f"\n❌ FAILURE: Issues detected")
        return False

if __name__ == "__main__":
    success = test_exact_user_scenario()
    exit(0 if success else 1)