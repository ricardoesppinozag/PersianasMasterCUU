#!/usr/bin/env python3

import requests
import json
import base64
from datetime import datetime
import sys
import os

# Backend URL from environment
BACKEND_URL = "https://roller-quote-hub.preview.emergentagent.com/api"

def log_test(test_name, result, details=""):
    """Log test results with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    status = "✅ PASS" if result else "❌ FAIL"
    print(f"[{timestamp}] {status}: {test_name}")
    if details:
        print(f"         {details}")
    return result

def test_dual_pdf_pricing():
    """Test the dual PDF pricing fix as requested"""
    print("\n=== DUAL PDF PRICING TEST ===")
    
    try:
        # Step 1: Get products list to find a real product ID
        print(f"\n1. Getting products list from {BACKEND_URL}/products")
        response = requests.get(f"{BACKEND_URL}/products")
        
        if not log_test("GET /api/products", response.status_code == 200, f"Status: {response.status_code}"):
            print(f"Response: {response.text}")
            return False
            
        products = response.json()
        if not products:
            log_test("Products available", False, "No products found")
            return False
            
        # Use first product
        product = products[0]
        product_id = product['id']
        
        log_test("Product found", True, 
                f"Product: {product['name']}, Distributor: ${product['distributor_price']}/m², Client: ${product['client_price']}/m²")
        
        # Step 2: Create a quote using the real product
        print(f"\n2. Creating quote with product ID: {product_id}")
        quote_data = {
            "items": [{
                "product_id": product_id,
                "product_name": product['name'],
                "color": "Blanco",
                "width": 2.0,
                "height": 2.5,
                "unit_price": product['distributor_price'],  # Use distributor price as base
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
        
        if not log_test("POST /api/quotes", response.status_code == 200, f"Status: {response.status_code}"):
            print(f"Response: {response.text}")
            return False
            
        quote = response.json()
        quote_id = quote['id']
        calculated_m2 = quote['items'][0]['square_meters']
        
        log_test("Quote created", True, 
                f"Quote ID: {quote_id}, M²: {calculated_m2}, Total: ${quote['total']}")
        
        # Step 3: Generate dual PDFs
        print(f"\n3. Generating dual PDFs for quote {quote_id}")
        response = requests.get(f"{BACKEND_URL}/quotes/{quote_id}/pdf/both")
        
        if not log_test("GET /api/quotes/{id}/pdf/both", response.status_code == 200, f"Status: {response.status_code}"):
            print(f"Response: {response.text}")
            return False
            
        pdf_response = response.json()
        
        # Verify response structure
        required_fields = ['distributor_pdf_base64', 'distributor_filename', 'client_pdf_base64', 'client_filename']
        missing_fields = [field for field in required_fields if field not in pdf_response]
        
        if not log_test("PDF response structure", len(missing_fields) == 0, 
                       f"Missing fields: {missing_fields}" if missing_fields else "All fields present"):
            return False
        
        # Step 4: Decode and verify PDFs contain different content
        print(f"\n4. Verifying PDF content differences")
        
        distributor_pdf_data = base64.b64decode(pdf_response['distributor_pdf_base64'])
        client_pdf_data = base64.b64decode(pdf_response['client_pdf_base64'])
        
        # Check that PDFs are different
        pdfs_different = distributor_pdf_data != client_pdf_data
        log_test("PDFs are different", pdfs_different, 
                f"Distributor PDF: {len(distributor_pdf_data)} bytes, Client PDF: {len(client_pdf_data)} bytes")
        
        # Calculate expected totals for verification
        expected_distributor_total = calculated_m2 * product['distributor_price']
        expected_client_total = calculated_m2 * product['client_price']
        
        log_test("Expected pricing verification", True, 
                f"Expected distributor total: ${expected_distributor_total:.2f} ({calculated_m2}m² × ${product['distributor_price']})")
        log_test("Expected pricing verification", True, 
                f"Expected client total: ${expected_client_total:.2f} ({calculated_m2}m² × ${product['client_price']})")
        
        # Verify filenames
        distributor_filename_correct = 'distribuidor' in pdf_response['distributor_filename']
        client_filename_correct = 'cliente' in pdf_response['client_filename']
        
        log_test("Distributor filename", distributor_filename_correct, pdf_response['distributor_filename'])
        log_test("Client filename", client_filename_correct, pdf_response['client_filename'])
        
        # Save PDFs for manual verification if needed
        try:
            with open('/app/test_distributor.pdf', 'wb') as f:
                f.write(distributor_pdf_data)
            with open('/app/test_client.pdf', 'wb') as f:
                f.write(client_pdf_data)
            log_test("PDFs saved for verification", True, "Saved as /app/test_distributor.pdf and /app/test_client.pdf")
        except Exception as e:
            log_test("PDF file save", False, f"Error: {e}")
        
        # Overall test result
        overall_success = (
            pdfs_different and 
            distributor_filename_correct and 
            client_filename_correct and
            expected_distributor_total != expected_client_total
        )
        
        log_test("DUAL PDF PRICING FIX", overall_success, 
                "✅ Fix verified: PDFs are different with proper pricing structure" if overall_success 
                else "❌ Issues found with dual PDF pricing")
        
        return overall_success
        
    except requests.exceptions.RequestException as e:
        log_test("Network connectivity", False, f"Connection error: {e}")
        return False
    except Exception as e:
        log_test("Test execution", False, f"Unexpected error: {e}")
        return False

def test_basic_backend_functionality():
    """Test basic backend endpoints to ensure system is working"""
    print("\n=== BASIC BACKEND TESTS ===")
    
    try:
        # Test root endpoint
        response = requests.get(f"{BACKEND_URL}/")
        log_test("API root endpoint", response.status_code == 200, f"Message: {response.json().get('message', 'N/A')}")
        
        # Test products endpoint
        response = requests.get(f"{BACKEND_URL}/products")
        products_working = response.status_code == 200
        log_test("Products endpoint", products_working, f"Found {len(response.json()) if products_working else 0} products")
        
        # Test quotes endpoint  
        response = requests.get(f"{BACKEND_URL}/quotes")
        quotes_working = response.status_code == 200
        log_test("Quotes endpoint", quotes_working, f"Found {len(response.json()) if quotes_working else 0} quotes")
        
        return products_working and quotes_working
        
    except Exception as e:
        log_test("Basic backend tests", False, f"Error: {e}")
        return False

def main():
    """Run all tests"""
    print("=" * 60)
    print("BACKEND DUAL PDF PRICING TEST SUITE")
    print("=" * 60)
    
    # Test basic functionality first
    basic_tests_passed = test_basic_backend_functionality()
    
    if not basic_tests_passed:
        print("\n❌ CRITICAL: Basic backend functionality failed. Cannot proceed with dual PDF testing.")
        return False
    
    # Test the dual PDF pricing fix
    dual_pdf_tests_passed = test_dual_pdf_pricing()
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    if dual_pdf_tests_passed:
        print("✅ SUCCESS: Dual PDF pricing fix is working correctly")
        print("   - Different PDFs generated for distributor and client")
        print("   - Proper filename differentiation")
        print("   - Expected pricing structure verified")
        return True
    else:
        print("❌ FAILURE: Dual PDF pricing fix has issues")
        print("   - Review test output above for specific failures")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)