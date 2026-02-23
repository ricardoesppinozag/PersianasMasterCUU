#!/usr/bin/env python3
"""
Backend API Test Suite for Blinds Quote Application
Tests all backend endpoints with proper validation
"""

import requests
import json
import sys
import time
import os
from datetime import datetime

# Get the backend URL from environment
BACKEND_URL = "https://roller-quote-hub.preview.emergentagent.com/api"

class BackendAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = requests.Session()
        self.test_results = []
        self.created_product_id = None
        self.created_quote_id = None
    
    def log_test(self, test_name, success, message, details=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if details and not success:
            print(f"    Details: {details}")
    
    def test_api_root(self):
        """Test API root endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_test("API Root", True, f"API is accessible: {data['message']}")
                    return True
                else:
                    self.log_test("API Root", False, "Response missing message field", response.text)
            else:
                self.log_test("API Root", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_test("API Root", False, f"Connection error: {str(e)}")
        return False
    
    def test_get_products(self):
        """Test GET /api/products - List all products"""
        try:
            response = self.session.get(f"{self.base_url}/products")
            if response.status_code == 200:
                products = response.json()
                if isinstance(products, list):
                    # Verify product structure
                    if products:  # If there are products
                        product = products[0]
                        required_fields = ['id', 'name', 'description', 'distributor_price', 'client_price', 'created_at']
                        missing_fields = [field for field in required_fields if field not in product]
                        if missing_fields:
                            self.log_test("GET /api/products", False, f"Missing fields: {missing_fields}", product)
                            return False
                        
                        # Verify price fields are numbers
                        if not isinstance(product['distributor_price'], (int, float)) or not isinstance(product['client_price'], (int, float)):
                            self.log_test("GET /api/products", False, "Price fields are not numeric", product)
                            return False
                    
                    self.log_test("GET /api/products", True, f"Retrieved {len(products)} products with correct structure")
                    return True
                else:
                    self.log_test("GET /api/products", False, "Response is not a list", response.text)
            else:
                self.log_test("GET /api/products", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_test("GET /api/products", False, f"Error: {str(e)}")
        return False
    
    def test_seed_products(self):
        """Test POST /api/products/seed - Seed sample products"""
        try:
            response = self.session.post(f"{self.base_url}/products/seed")
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_test("POST /api/products/seed", True, data["message"])
                    return True
                else:
                    self.log_test("POST /api/products/seed", False, "Response missing message", response.text)
            else:
                self.log_test("POST /api/products/seed", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_test("POST /api/products/seed", False, f"Error: {str(e)}")
        return False
    
    def test_create_product(self):
        """Test POST /api/products - Create new product"""
        test_product = {
            "name": "Test Persiana Automática",
            "description": "Persiana de prueba con motor automatizado para testing",
            "distributor_price": 750.0,
            "client_price": 975.0
        }
        
        try:
            response = self.session.post(f"{self.base_url}/products", json=test_product)
            if response.status_code == 200:
                product = response.json()
                # Verify required fields
                required_fields = ['id', 'name', 'description', 'distributor_price', 'client_price', 'created_at']
                missing_fields = [field for field in required_fields if field not in product]
                if missing_fields:
                    self.log_test("POST /api/products", False, f"Missing fields in response: {missing_fields}", product)
                    return False
                
                # Verify data matches
                if (product['name'] == test_product['name'] and 
                    product['distributor_price'] == test_product['distributor_price'] and
                    product['client_price'] == test_product['client_price']):
                    self.created_product_id = product['id']
                    self.log_test("POST /api/products", True, f"Created product with ID: {product['id']}")
                    return True
                else:
                    self.log_test("POST /api/products", False, "Response data doesn't match input", product)
            else:
                self.log_test("POST /api/products", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_test("POST /api/products", False, f"Error: {str(e)}")
        return False
    
    def test_update_product(self):
        """Test PUT /api/products/{id} - Update product"""
        if not self.created_product_id:
            self.log_test("PUT /api/products/{id}", False, "No product ID available for update test")
            return False
        
        update_data = {
            "name": "Test Persiana Automática ACTUALIZADA",
            "distributor_price": 800.0
        }
        
        try:
            response = self.session.put(f"{self.base_url}/products/{self.created_product_id}", json=update_data)
            if response.status_code == 200:
                product = response.json()
                if (product['name'] == update_data['name'] and 
                    product['distributor_price'] == update_data['distributor_price']):
                    self.log_test("PUT /api/products/{id}", True, f"Updated product {self.created_product_id}")
                    return True
                else:
                    self.log_test("PUT /api/products/{id}", False, "Update data not reflected", product)
            else:
                self.log_test("PUT /api/products/{id}", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_test("PUT /api/products/{id}", False, f"Error: {str(e)}")
        return False
    
    def test_create_quote(self):
        """Test POST /api/quotes - Create quote with M2 calculations"""
        # First get available products
        try:
            products_response = self.session.get(f"{self.base_url}/products")
            if products_response.status_code != 200:
                self.log_test("POST /api/quotes", False, "Cannot get products for quote test")
                return False
            
            products = products_response.json()
            if not products:
                self.log_test("POST /api/quotes", False, "No products available for quote test")
                return False
            
            # Use first product for test
            product = products[0]
            
            test_quote = {
                "items": [
                    {
                        "product_id": product['id'],
                        "product_name": product['name'],
                        "width": 2.5,
                        "height": 1.8,
                        "unit_price": product['client_price']
                    },
                    {
                        "product_id": product['id'],
                        "product_name": product['name'],
                        "width": 1.2,
                        "height": 2.0,
                        "unit_price": product['client_price']
                    }
                ],
                "client_type": "client",
                "client_name": "María González Rodríguez",
                "client_phone": "+52 555 987 6543",
                "client_email": "maria.gonzalez@email.com",
                "notes": "Instalación programada para el próximo viernes"
            }
            
            response = self.session.post(f"{self.base_url}/quotes", json=test_quote)
            if response.status_code == 200:
                quote = response.json()
                
                # Verify quote structure
                required_fields = ['id', 'items', 'total', 'client_type', 'client_name', 'created_at']
                missing_fields = [field for field in required_fields if field not in quote]
                if missing_fields:
                    self.log_test("POST /api/quotes", False, f"Missing fields: {missing_fields}", quote)
                    return False
                
                # Verify M2 calculations
                expected_total = 0
                for i, item in enumerate(quote['items']):
                    expected_m2 = round(test_quote['items'][i]['width'] * test_quote['items'][i]['height'], 2)
                    expected_subtotal = round(expected_m2 * test_quote['items'][i]['unit_price'], 2)
                    expected_total += expected_subtotal
                    
                    if (item['square_meters'] != expected_m2 or 
                        abs(item['subtotal'] - expected_subtotal) > 0.01):
                        self.log_test("POST /api/quotes", False, 
                                    f"M2 calculation error in item {i+1}. Got M²: {item['square_meters']}, expected: {expected_m2}, Got subtotal: {item['subtotal']}, expected: {expected_subtotal}")
                        return False
                
                # Verify total calculation
                if abs(quote['total'] - expected_total) > 0.01:
                    self.log_test("POST /api/quotes", False, 
                                f"Total calculation error. Got: {quote['total']}, expected: {expected_total}")
                    return False
                
                self.created_quote_id = quote['id']
                self.log_test("POST /api/quotes", True, 
                            f"Created quote with correct M² calculations. Total: ${quote['total']:.2f}")
                return True
            else:
                self.log_test("POST /api/quotes", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_test("POST /api/quotes", False, f"Error: {str(e)}")
        return False
    
    def test_get_quotes(self):
        """Test GET /api/quotes - List all quotes"""
        try:
            response = self.session.get(f"{self.base_url}/quotes")
            if response.status_code == 200:
                quotes = response.json()
                if isinstance(quotes, list):
                    if quotes:  # If there are quotes
                        quote = quotes[0]
                        required_fields = ['id', 'items', 'total', 'client_type', 'created_at']
                        missing_fields = [field for field in required_fields if field not in quote]
                        if missing_fields:
                            self.log_test("GET /api/quotes", False, f"Missing fields: {missing_fields}", quote)
                            return False
                    
                    self.log_test("GET /api/quotes", True, f"Retrieved {len(quotes)} quotes with correct structure")
                    return True
                else:
                    self.log_test("GET /api/quotes", False, "Response is not a list", response.text)
            else:
                self.log_test("GET /api/quotes", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_test("GET /api/quotes", False, f"Error: {str(e)}")
        return False
    
    def test_generate_pdf(self):
        """Test GET /api/quotes/{id}/pdf - Generate PDF"""
        if not self.created_quote_id:
            self.log_test("GET /api/quotes/{id}/pdf", False, "No quote ID available for PDF test")
            return False
        
        try:
            response = self.session.get(f"{self.base_url}/quotes/{self.created_quote_id}/pdf")
            if response.status_code == 200:
                pdf_data = response.json()
                if 'pdf_base64' in pdf_data and 'filename' in pdf_data:
                    # Verify it's valid base64
                    import base64
                    try:
                        base64.b64decode(pdf_data['pdf_base64'])
                        self.log_test("GET /api/quotes/{id}/pdf", True, 
                                    f"Generated PDF: {pdf_data['filename']}")
                        return True
                    except Exception as decode_error:
                        self.log_test("GET /api/quotes/{id}/pdf", False, 
                                    f"Invalid base64 PDF data: {decode_error}")
                else:
                    self.log_test("GET /api/quotes/{id}/pdf", False, 
                                "Missing pdf_base64 or filename in response", pdf_data)
            else:
                self.log_test("GET /api/quotes/{id}/pdf", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_test("GET /api/quotes/{id}/pdf", False, f"Error: {str(e)}")
        return False
    
    def test_generate_dual_pdf(self):
        """Test GET /api/quotes/{id}/pdf/both - Generate both distributor and client PDFs"""
        if not self.created_quote_id:
            self.log_test("GET /api/quotes/{id}/pdf/both", False, "No quote ID available for dual PDF test")
            return False
        
        try:
            response = self.session.get(f"{self.base_url}/quotes/{self.created_quote_id}/pdf/both")
            if response.status_code == 200:
                pdf_data = response.json()
                
                # Check required fields
                required_fields = ['distributor_pdf_base64', 'distributor_filename', 'client_pdf_base64', 'client_filename']
                missing_fields = [field for field in required_fields if field not in pdf_data]
                if missing_fields:
                    self.log_test("GET /api/quotes/{id}/pdf/both", False, 
                                f"Missing required fields: {missing_fields}", pdf_data)
                    return False
                
                # Verify filename endings
                if not pdf_data['distributor_filename'].endswith('_distribuidor.pdf'):
                    self.log_test("GET /api/quotes/{id}/pdf/both", False, 
                                f"Distributor filename should end with '_distribuidor.pdf', got: {pdf_data['distributor_filename']}")
                    return False
                
                if not pdf_data['client_filename'].endswith('_cliente.pdf'):
                    self.log_test("GET /api/quotes/{id}/pdf/both", False, 
                                f"Client filename should end with '_cliente.pdf', got: {pdf_data['client_filename']}")
                    return False
                
                # Verify both are valid base64
                import base64
                try:
                    distributor_pdf_bytes = base64.b64decode(pdf_data['distributor_pdf_base64'])
                    client_pdf_bytes = base64.b64decode(pdf_data['client_pdf_base64'])
                except Exception as decode_error:
                    self.log_test("GET /api/quotes/{id}/pdf/both", False, 
                                f"Invalid base64 PDF data: {decode_error}")
                    return False
                
                # Verify PDFs are different (different pricing)
                if pdf_data['distributor_pdf_base64'] == pdf_data['client_pdf_base64']:
                    self.log_test("GET /api/quotes/{id}/pdf/both", False, 
                                "Distributor and client PDFs are identical - they should have different pricing")
                    return False
                
                # Verify PDF sizes are reasonable (both should be > 1000 bytes)
                if len(distributor_pdf_bytes) < 1000 or len(client_pdf_bytes) < 1000:
                    self.log_test("GET /api/quotes/{id}/pdf/both", False, 
                                f"PDF files seem too small - distributor: {len(distributor_pdf_bytes)} bytes, client: {len(client_pdf_bytes)} bytes")
                    return False
                
                self.log_test("GET /api/quotes/{id}/pdf/both", True, 
                            f"Generated dual PDFs: {pdf_data['distributor_filename']} and {pdf_data['client_filename']}")
                return True
                
            else:
                self.log_test("GET /api/quotes/{id}/pdf/both", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_test("GET /api/quotes/{id}/pdf/both", False, f"Error: {str(e)}")
        return False
    
    def test_dual_pdf_review_request(self):
        """Test the specific dual PDF scenario from review request"""
        # Create specific test quote as requested in review
        test_quote_data = {
            "items": [{
                "product_id": "test123",
                "product_name": "Persiana Test", 
                "color": "Blanco",
                "width": 1.5,
                "height": 2.0,
                "unit_price": 450.0,
                "chain_orientation": "Derecha",
                "fascia_type": "Redonda", 
                "fascia_color": "Blanca",
                "fascia_price": 50.0,
                "installation_price": 100.0
            }],
            "client_type": "distributor",
            "client_name": "Test Client",
            "notes": "Test note"
        }
        
        try:
            # Step 1: Create the test quote
            response = self.session.post(f"{self.base_url}/quotes", json=test_quote_data)
            if response.status_code != 200:
                self.log_test("Review Request - Dual PDF", False, 
                            f"Failed to create test quote: HTTP {response.status_code}", response.text)
                return False
            
            quote = response.json()
            quote_id = quote['id']
            
            # Step 2: Call the dual PDF endpoint
            response = self.session.get(f"{self.base_url}/quotes/{quote_id}/pdf/both")
            if response.status_code != 200:
                self.log_test("Review Request - Dual PDF", False, 
                            f"Dual PDF endpoint failed: HTTP {response.status_code}", response.text)
                return False
            
            pdf_data = response.json()
            
            # Step 3: Verify response structure
            required_fields = ['distributor_pdf_base64', 'distributor_filename', 'client_pdf_base64', 'client_filename']
            missing_fields = [field for field in required_fields if field not in pdf_data]
            if missing_fields:
                self.log_test("Review Request - Dual PDF", False, 
                            f"Missing required fields in response: {missing_fields}", pdf_data)
                return False
            
            # Step 4: Verify filename patterns
            if not pdf_data['distributor_filename'].endswith('_distribuidor.pdf'):
                self.log_test("Review Request - Dual PDF", False, 
                            f"Distributor filename incorrect pattern: {pdf_data['distributor_filename']}")
                return False
                
            if not pdf_data['client_filename'].endswith('_cliente.pdf'):
                self.log_test("Review Request - Dual PDF", False, 
                            f"Client filename incorrect pattern: {pdf_data['client_filename']}")
                return False
            
            # Step 5: Verify both base64 strings are valid
            import base64
            try:
                distributor_pdf_bytes = base64.b64decode(pdf_data['distributor_pdf_base64'])
                client_pdf_bytes = base64.b64decode(pdf_data['client_pdf_base64'])
            except Exception as decode_error:
                self.log_test("Review Request - Dual PDF", False, 
                            f"Invalid base64 PDF data: {decode_error}")
                return False
            
            # Step 6: Verify PDFs are different (different pricing labels)
            if pdf_data['distributor_pdf_base64'] == pdf_data['client_pdf_base64']:
                self.log_test("Review Request - Dual PDF", False, 
                            "Distributor and client PDFs are identical - should have different pricing labels")
                return False
            
            # Step 7: Verify PDF files are valid (reasonable size)
            if len(distributor_pdf_bytes) < 1000 or len(client_pdf_bytes) < 1000:
                self.log_test("Review Request - Dual PDF", False, 
                            f"PDF files too small: distributor={len(distributor_pdf_bytes)} bytes, client={len(client_pdf_bytes)} bytes")
                return False
            
            self.log_test("Review Request - Dual PDF", True, 
                        f"✅ All requirements met - Generated dual PDFs with different pricing labels. "
                        f"Distributor: {len(distributor_pdf_bytes)} bytes, Client: {len(client_pdf_bytes)} bytes")
            return True
            
        except Exception as e:
            self.log_test("Review Request - Dual PDF", False, f"Error: {str(e)}")
            return False
    
    def test_delete_product(self):
        """Test DELETE /api/products/{id} - Delete product"""
        if not self.created_product_id:
            self.log_test("DELETE /api/products/{id}", False, "No product ID available for delete test")
            return False
        
        try:
            response = self.session.delete(f"{self.base_url}/products/{self.created_product_id}")
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_test("DELETE /api/products/{id}", True, f"Deleted product {self.created_product_id}")
                    return True
                else:
                    self.log_test("DELETE /api/products/{id}", False, "No confirmation message", response.text)
            else:
                self.log_test("DELETE /api/products/{id}", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_test("DELETE /api/products/{id}", False, f"Error: {str(e)}")
        return False
    
    def run_all_tests(self):
        """Run all backend API tests"""
        print("🚀 Starting Backend API Tests for Blinds Quote Application")
        print(f"Testing against: {self.base_url}")
        print("=" * 70)
        
        # Test sequence - order matters for dependencies
        tests = [
            self.test_api_root,
            self.test_seed_products,  # Ensure we have products first
            self.test_get_products,
            self.test_create_product,
            self.test_update_product,
            self.test_create_quote,  # This depends on products existing
            self.test_get_quotes,
            self.test_generate_pdf,  # This depends on quote existing
            self.test_generate_dual_pdf,  # NEW: Test dual PDF generation
            self.test_delete_product  # Cleanup
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            test()
            if self.test_results[-1]['success']:
                passed += 1
            else:
                failed += 1
            time.sleep(0.5)  # Small delay between tests
        
        print("=" * 70)
        print(f"📊 Test Results: {passed} passed, {failed} failed")
        
        if failed > 0:
            print("\n❌ Failed Tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['message']}")
        
        return failed == 0

def main():
    """Main test runner"""
    print("Backend API Testing Suite")
    print(f"Target URL: {BACKEND_URL}")
    
    tester = BackendAPITester(BACKEND_URL)
    
    try:
        success = tester.run_all_tests()
        
        # Write detailed results to file
        with open('/app/test_results_detailed.json', 'w') as f:
            json.dump(tester.test_results, f, indent=2)
        
        if success:
            print("\n✅ ALL TESTS PASSED - Backend API is working correctly!")
            return 0
        else:
            print("\n❌ SOME TESTS FAILED - Check detailed results above")
            return 1
            
    except KeyboardInterrupt:
        print("\n⚠️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Unexpected error: {e}")
        return 1

if __name__ == "__main__":
    exit(main())