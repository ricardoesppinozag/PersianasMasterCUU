import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Product {
  id: string;
  name: string;
  description: string;
  distributor_price: number;
  client_price: number;
}

interface QuoteItem {
  product_id: string;
  product_name: string;
  width: number;
  height: number;
  square_meters: number;
  unit_price: number;
  subtotal: number;
}

export default function QuoteScreen() {
  const [isDistributor, setIsDistributor] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  
  // Form state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  
  // Client info
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('');

  const fetchProducts = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/products`);
      if (response.ok) {
        const data = await response.json();
        if (data.length === 0) {
          // Seed products if none exist
          await fetch(`${BACKEND_URL}/api/products/seed`, { method: 'POST' });
          const newResponse = await fetch(`${BACKEND_URL}/api/products`);
          const newData = await newResponse.json();
          setProducts(newData);
        } else {
          setProducts(data);
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      Alert.alert('Error', 'No se pudieron cargar los productos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProducts();
  }, [fetchProducts]);

  const getPrice = (product: Product) => {
    return isDistributor ? product.distributor_price : product.client_price;
  };

  const calculateSquareMeters = () => {
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    return w * h;
  };

  const addItemToQuote = () => {
    if (!selectedProduct) {
      Alert.alert('Error', 'Selecciona un producto');
      return;
    }
    
    const w = parseFloat(width);
    const h = parseFloat(height);
    
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
      Alert.alert('Error', 'Ingresa medidas válidas');
      return;
    }
    
    const sqm = w * h;
    const unitPrice = getPrice(selectedProduct);
    const subtotal = sqm * unitPrice;
    
    const newItem: QuoteItem = {
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      width: w,
      height: h,
      square_meters: sqm,
      unit_price: unitPrice,
      subtotal: subtotal,
    };
    
    setQuoteItems([...quoteItems, newItem]);
    setSelectedProduct(null);
    setWidth('');
    setHeight('');
  };

  const removeItem = (index: number) => {
    const newItems = [...quoteItems];
    newItems.splice(index, 1);
    setQuoteItems(newItems);
  };

  const getTotal = () => {
    return quoteItems.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const clearQuote = () => {
    Alert.alert(
      'Limpiar Cotización',
      '¿Estás seguro de que deseas eliminar todos los items?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Limpiar', 
          style: 'destructive',
          onPress: () => {
            setQuoteItems([]);
            setClientName('');
            setClientPhone('');
            setClientEmail('');
            setNotes('');
          }
        },
      ]
    );
  };

  const saveAndExportPDF = async () => {
    if (quoteItems.length === 0) {
      Alert.alert('Error', 'Agrega al menos un producto a la cotización');
      return;
    }
    
    setSavingQuote(true);
    
    try {
      // Save quote to backend
      const quoteData = {
        items: quoteItems.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          width: item.width,
          height: item.height,
          unit_price: item.unit_price,
        })),
        client_type: isDistributor ? 'distributor' : 'client',
        client_name: clientName || null,
        client_phone: clientPhone || null,
        client_email: clientEmail || null,
        notes: notes || null,
      };
      
      const response = await fetch(`${BACKEND_URL}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteData),
      });
      
      if (!response.ok) {
        throw new Error('Error al guardar la cotización');
      }
      
      const savedQuote = await response.json();
      
      // Generate PDF
      const pdfResponse = await fetch(`${BACKEND_URL}/api/quotes/${savedQuote.id}/pdf`);
      
      if (!pdfResponse.ok) {
        throw new Error('Error al generar el PDF');
      }
      
      const pdfData = await pdfResponse.json();
      
      // Save and share PDF
      const fileUri = FileSystem.documentDirectory + pdfData.filename;
      await FileSystem.writeAsStringAsync(fileUri, pdfData.pdf_base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Éxito', 'Cotización guardada. El PDF se generó correctamente.');
      }
      
      // Clear the form after successful save
      setQuoteItems([]);
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setNotes('');
      
    } catch (error) {
      console.error('Error saving quote:', error);
      Alert.alert('Error', 'No se pudo guardar la cotización');
    } finally {
      setSavingQuote(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498db" />
          <Text style={styles.loadingText}>Cargando productos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView 
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3498db" />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Nueva Cotización</Text>
            <Text style={styles.subtitle}>Persianas Enrollables</Text>
          </View>

          {/* Toggle Distributor/Client */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, isDistributor && styles.toggleButtonActive]}
              onPress={() => setIsDistributor(true)}
            >
              <Ionicons 
                name="business" 
                size={20} 
                color={isDistributor ? '#fff' : '#7f8c8d'} 
              />
              <Text style={[styles.toggleText, isDistributor && styles.toggleTextActive]}>
                Distribuidor
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, !isDistributor && styles.toggleButtonActive]}
              onPress={() => setIsDistributor(false)}
            >
              <Ionicons 
                name="person" 
                size={20} 
                color={!isDistributor ? '#fff' : '#7f8c8d'} 
              />
              <Text style={[styles.toggleText, !isDistributor && styles.toggleTextActive]}>
                Cliente
              </Text>
            </TouchableOpacity>
          </View>

          {/* Product Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Agregar Producto</Text>
            
            <TouchableOpacity
              style={styles.productPicker}
              onPress={() => setShowProductPicker(true)}
            >
              <Text style={selectedProduct ? styles.productPickerText : styles.productPickerPlaceholder}>
                {selectedProduct ? selectedProduct.name : 'Seleccionar producto...'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#7f8c8d" />
            </TouchableOpacity>

            {selectedProduct && (
              <Text style={styles.priceInfo}>
                Precio: ${getPrice(selectedProduct).toFixed(2)} / m²
              </Text>
            )}

            {/* Measurements */}
            <View style={styles.measurementsRow}>
              <View style={styles.measurementInput}>
                <Text style={styles.inputLabel}>Ancho (m)</Text>
                <TextInput
                  style={styles.input}
                  value={width}
                  onChangeText={setWidth}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#7f8c8d"
                />
              </View>
              <View style={styles.measurementInput}>
                <Text style={styles.inputLabel}>Alto (m)</Text>
                <TextInput
                  style={styles.input}
                  value={height}
                  onChangeText={setHeight}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#7f8c8d"
                />
              </View>
            </View>

            {/* Auto-calculated M² */}
            <View style={styles.calculatedRow}>
              <Text style={styles.calculatedLabel}>Metros Cuadrados:</Text>
              <Text style={styles.calculatedValue}>{calculateSquareMeters().toFixed(2)} m²</Text>
            </View>

            {selectedProduct && width && height && (
              <View style={styles.calculatedRow}>
                <Text style={styles.calculatedLabel}>Subtotal:</Text>
                <Text style={styles.calculatedValueHighlight}>
                  ${(calculateSquareMeters() * getPrice(selectedProduct)).toFixed(2)}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.addButton} onPress={addItemToQuote}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Agregar a Cotización</Text>
            </TouchableOpacity>
          </View>

          {/* Quote Items List */}
          {quoteItems.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Items en Cotización</Text>
                <TouchableOpacity onPress={clearQuote}>
                  <Ionicons name="trash-outline" size={22} color="#e74c3c" />
                </TouchableOpacity>
              </View>
              
              {quoteItems.map((item, index) => (
                <View key={index} style={styles.quoteItem}>
                  <View style={styles.quoteItemInfo}>
                    <Text style={styles.quoteItemName}>{item.product_name}</Text>
                    <Text style={styles.quoteItemDetails}>
                      {item.width.toFixed(2)}m × {item.height.toFixed(2)}m = {item.square_meters.toFixed(2)} m²
                    </Text>
                    <Text style={styles.quoteItemPrice}>
                      ${item.unit_price.toFixed(2)}/m² → ${item.subtotal.toFixed(2)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeButton}>
                    <Ionicons name="close-circle" size={24} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Total */}
              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>TOTAL:</Text>
                <Text style={styles.totalValue}>${getTotal().toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Client Info (Optional) */}
          {quoteItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Datos del Cliente (Opcional)</Text>
              
              <TextInput
                style={styles.inputFull}
                value={clientName}
                onChangeText={setClientName}
                placeholder="Nombre del cliente"
                placeholderTextColor="#7f8c8d"
              />
              
              <TextInput
                style={styles.inputFull}
                value={clientPhone}
                onChangeText={setClientPhone}
                placeholder="Teléfono"
                placeholderTextColor="#7f8c8d"
                keyboardType="phone-pad"
              />
              
              <TextInput
                style={styles.inputFull}
                value={clientEmail}
                onChangeText={setClientEmail}
                placeholder="Email"
                placeholderTextColor="#7f8c8d"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              
              <TextInput
                style={[styles.inputFull, styles.notesInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Notas adicionales"
                placeholderTextColor="#7f8c8d"
                multiline
                numberOfLines={3}
              />
            </View>
          )}

          {/* Export Button */}
          {quoteItems.length > 0 && (
            <TouchableOpacity 
              style={styles.exportButton} 
              onPress={saveAndExportPDF}
              disabled={savingQuote}
            >
              {savingQuote ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="document-text" size={24} color="#fff" />
                  <Text style={styles.exportButtonText}>Guardar y Exportar PDF</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>

        {/* Product Picker Modal */}
        <Modal
          visible={showProductPicker}
          transparent
          animationType="slide"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Seleccionar Producto</Text>
                <TouchableOpacity onPress={() => setShowProductPicker(false)}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalScroll}>
                {products.map((product) => (
                  <TouchableOpacity
                    key={product.id}
                    style={styles.productOption}
                    onPress={() => {
                      setSelectedProduct(product);
                      setShowProductPicker(false);
                    }}
                  >
                    <View style={styles.productOptionInfo}>
                      <Text style={styles.productOptionName}>{product.name}</Text>
                      <Text style={styles.productOptionDesc}>{product.description}</Text>
                    </View>
                    <View style={styles.productOptionPrice}>
                      <Text style={styles.priceLabel}>
                        {isDistributor ? 'Dist.' : 'Cliente'}
                      </Text>
                      <Text style={styles.priceValue}>
                        ${getPrice(product).toFixed(2)}/m²
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  flex: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#7f8c8d',
    fontSize: 16,
  },
  header: {
    padding: 20,
    paddingTop: 10,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    marginTop: 4,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  toggleButtonActive: {
    backgroundColor: '#3498db',
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  toggleTextActive: {
    color: '#fff',
  },
  section: {
    marginTop: 20,
    marginHorizontal: 20,
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  productPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  productPickerText: {
    color: '#fff',
    fontSize: 15,
  },
  productPickerPlaceholder: {
    color: '#7f8c8d',
    fontSize: 15,
  },
  priceInfo: {
    color: '#2ecc71',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  measurementsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  measurementInput: {
    flex: 1,
  },
  inputLabel: {
    color: '#7f8c8d',
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  calculatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  calculatedLabel: {
    color: '#7f8c8d',
    fontSize: 14,
  },
  calculatedValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  calculatedValueHighlight: {
    color: '#2ecc71',
    fontSize: 18,
    fontWeight: '700',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3498db',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  quoteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  quoteItemInfo: {
    flex: 1,
  },
  quoteItemName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  quoteItemDetails: {
    color: '#7f8c8d',
    fontSize: 13,
    marginTop: 4,
  },
  quoteItemPrice: {
    color: '#2ecc71',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  removeButton: {
    padding: 4,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 16,
    marginTop: 4,
  },
  totalLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  totalValue: {
    color: '#2ecc71',
    fontSize: 24,
    fontWeight: '700',
  },
  inputFull: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    marginBottom: 12,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27ae60',
    borderRadius: 12,
    padding: 18,
    marginHorizontal: 20,
    marginTop: 20,
    gap: 10,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#16213e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  modalScroll: {
    padding: 16,
  },
  productOption: {
    flexDirection: 'row',
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  productOptionInfo: {
    flex: 1,
  },
  productOptionName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  productOptionDesc: {
    color: '#7f8c8d',
    fontSize: 13,
    marginTop: 4,
  },
  productOptionPrice: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  priceLabel: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  priceValue: {
    color: '#2ecc71',
    fontSize: 16,
    fontWeight: '700',
  },
});
