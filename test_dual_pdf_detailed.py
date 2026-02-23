#!/usr/bin/env python3
"""
Detailed test to verify dual PDF generation with different pricing
"""

import requests
import json
import base64

BACKEND_URL = "https://roller-quote-hub.preview.emergentagent.com/api"

def test_dual_pdf_pricing():
    """Test that dual PDF generates different pricing for distributor vs client"""
    
    # First, get a product to see the different prices
    response = requests.get(f"{BACKEND_URL}/products")
    if response.status_code != 200:
        print("❌ Failed to get products")
        return
    
    products = response.json()
    if not products:
        print("❌ No products found")
        return
    
    product = products[0]
    print(f"🔍 Using product: {product['name']}")
    print(f"   Distributor price: ${product['distributor_price']}")
    print(f"   Client price: ${product['client_price']}")
    
    # Create quote with distributor pricing
    quote_data = {
        "items": [{
            "product_id": product['id'],
            "product_name": product['name'],
            "color": "Blanco",
            "width": 2.0,
            "height": 1.5,
            "unit_price": product['distributor_price'],  # Using distributor price
            "chain_orientation": "Derecha",
            "fascia_type": "Redonda",
            "fascia_color": "Blanca",
            "fascia_price": 50.0,
            "installation_price": 100.0
        }],
        "client_type": "distributor",
        "client_name": "Test Distributor",
        "notes": "Test for dual PDF pricing"
    }
    
    # Create the quote
    response = requests.post(f"{BACKEND_URL}/quotes", json=quote_data)
    if response.status_code != 200:
        print(f"❌ Failed to create quote: {response.status_code}")
        print(response.text)
        return
    
    quote = response.json()
    quote_id = quote['id']
    print(f"✅ Created quote with ID: {quote_id}")
    print(f"   Quote total: ${quote['total']}")
    
    # Generate dual PDFs
    response = requests.get(f"{BACKEND_URL}/quotes/{quote_id}/pdf/both")
    if response.status_code != 200:
        print(f"❌ Failed to generate dual PDFs: {response.status_code}")
        print(response.text)
        return
    
    pdf_data = response.json()
    
    # Verify structure
    required_fields = ['distributor_pdf_base64', 'distributor_filename', 'client_pdf_base64', 'client_filename']
    for field in required_fields:
        if field not in pdf_data:
            print(f"❌ Missing field: {field}")
            return
    
    print(f"✅ Got dual PDFs:")
    print(f"   Distributor: {pdf_data['distributor_filename']}")
    print(f"   Client: {pdf_data['client_filename']}")
    
    # Decode PDFs and check if they're different
    try:
        dist_pdf = base64.b64decode(pdf_data['distributor_pdf_base64'])
        client_pdf = base64.b64decode(pdf_data['client_pdf_base64'])
        
        print(f"   Distributor PDF size: {len(dist_pdf)} bytes")
        print(f"   Client PDF size: {len(client_pdf)} bytes")
        
        if dist_pdf == client_pdf:
            print("⚠️  WARNING: PDFs are identical! They should have different pricing.")
            
            # Let's check the content more specifically by looking for price differences
            dist_str = str(dist_pdf)
            client_str = str(client_pdf)
            
            # Look for price mentions in the PDF bytes
            if f"{product['distributor_price']}" in dist_str and f"{product['client_price']}" in client_str:
                print("✅ Different prices found in PDF content")
            else:
                print("❌ Same pricing appears to be used in both PDFs")
        else:
            print("✅ PDFs are different - likely have different pricing")
            
    except Exception as e:
        print(f"❌ Error decoding PDFs: {e}")
        return
    
    # Now let's test generating individual PDFs to compare
    print("\n🔍 Testing individual PDF generation for comparison:")
    
    # Generate distributor PDF
    response = requests.get(f"{BACKEND_URL}/quotes/{quote_id}/pdf")
    if response.status_code == 200:
        single_pdf = response.json()
        single_pdf_bytes = base64.b64decode(single_pdf['pdf_base64'])
        print(f"   Single PDF (original quote type): {len(single_pdf_bytes)} bytes")
        
        if single_pdf_bytes == dist_pdf:
            print("✅ Distributor PDF matches single PDF (expected for distributor quote)")
        elif single_pdf_bytes == client_pdf:
            print("✅ Client PDF matches single PDF")
        else:
            print("⚠️  Single PDF doesn't match either dual PDF")

if __name__ == "__main__":
    test_dual_pdf_pricing()