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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ProductColor {
  name: string;
  code?: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  distributor_price: number;
  client_price: number;
  colors: ProductColor[];
}

interface QuoteItem {
  product_id: string;
  product_name: string;
  color: string | null;
  width: number;
  height: number;
  square_meters: number;
  unit_price: number;
  subtotal: number;
  chain_orientation: string;
  fascia_type: string;
  fascia_color: string;
  fascia_price: number;
  installation_price: number;
}

interface BusinessConfig {
  business_name: string;
  logo_base64: string | null;
}

const CHAIN_OPTIONS = ['Izquierda', 'Derecha'];
const FASCIA_OPTIONS = ['Redonda', 'Cuadrada sin forrar', 'Cuadrada forrada'];
const FASCIA_COLOR_OPTIONS = ['Negra', 'Blanca', 'Gris', 'Café', 'Ivory'];

export default function QuoteScreen() {
  const [isDistributor, setIsDistributor] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [businessConfig, setBusinessConfig] = useState<BusinessConfig | null>(null);
  
  // Form state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [colorText, setColorText] = useState(''); // Free text for color
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [chainOrientation, setChainOrientation] = useState('Derecha');
  const [fasciaType, setFasciaType] = useState('Redonda');
  const [fasciaColor, setFasciaColor] = useState('Blanca');
  const [fasciaPrice, setFasciaPrice] = useState('');
  const [installationPrice, setInstallationPrice] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showChainPicker, setShowChainPicker] = useState(false);
  const [showFasciaPicker, setShowFasciaPicker] = useState(false);
  const [showFasciaColorPicker, setShowFasciaColorPicker] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [distributorPdf, setDistributorPdf] = useState<{base64: string, filename: string} | null>(null);
  const [clientPdf, setClientPdf] = useState<{base64: string, filename: string} | null>(null);
  
  // Client info
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const productsResponse = await fetch(`${BACKEND_URL}/api/products`);
      if (productsResponse.ok) {
        const productsData = await productsResponse.json();
        if (productsData.length === 0) {
          await fetch(`${BACKEND_URL}/api/products/seed`, { method: 'POST' });
          const newResponse = await fetch(`${BACKEND_URL}/api/products`);
          const newData = await newResponse.json();
          setProducts(newData);
        } else {
          setProducts(productsData);
        }
      }
      
      const configResponse = await fetch(`${BACKEND_URL}/api/config`);
      if (configResponse.ok) {
        const configData = await configResponse.json();
        setBusinessConfig(configData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'No se pudieron cargar los datos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const getPrice = (product: Product) => {
    return isDistributor ? product.distributor_price : product.client_price;
  };

  const calculateSquareMeters = () => {
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    return w * h;
  };

  const getFasciaPriceValue = () => {
    return parseFloat(fasciaPrice) || 0;
  };

  const getInstallationPriceValue = () => {
    return parseFloat(installationPrice) || 0;
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
    const productSubtotal = sqm * unitPrice;
    const fasciaCost = getFasciaPriceValue();
    const installationCost = getInstallationPriceValue();
    const subtotal = productSubtotal + fasciaCost + installationCost;
    
    const newItem: QuoteItem = {
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      color: colorText.trim() || null,
      width: w,
      height: h,
      square_meters: sqm,
      unit_price: unitPrice,
      subtotal: subtotal,
      chain_orientation: chainOrientation,
      fascia_type: fasciaType,
      fascia_color: fasciaColor,
      fascia_price: fasciaCost,
      installation_price: installationCost,
    };
    
    setQuoteItems([...quoteItems, newItem]);
    setSelectedProduct(null);
    setColorText('');
    setWidth('');
    setHeight('');
    setChainOrientation('Derecha');
    setFasciaType('Redonda');
    setFasciaColor('Blanca');
    setFasciaPrice('');
    setInstallationPrice('');
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
      const quoteData = {
        items: quoteItems.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          color: item.color,
          width: item.width,
          height: item.height,
          unit_price: item.unit_price,
          chain_orientation: item.chain_orientation,
          fascia_type: item.fascia_type,
          fascia_color: item.fascia_color,
          fascia_price: item.fascia_price,
          installation_price: item.installation_price,
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
      
      // Fetch both PDFs (distributor and client)
      const pdfResponse = await fetch(`${BACKEND_URL}/api/quotes/${savedQuote.id}/pdf/both`);
      
      if (!pdfResponse.ok) {
        throw new Error('Error al generar los PDFs');
      }
      
      const pdfData = await pdfResponse.json();
      
      // Store both PDFs for sharing
      setDistributorPdf({
        base64: pdfData.distributor_pdf_base64,
        filename: pdfData.distributor_filename
      });
      setClientPdf({
        base64: pdfData.client_pdf_base64,
        filename: pdfData.client_filename
      });
      
      // Show modal with both PDF options
      setShowPdfModal(true);
      
      // Clear quote after saving
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

  const sharePdf = async (pdfType: 'distributor' | 'client') => {
    const pdfData = pdfType === 'distributor' ? distributorPdf : clientPdf;
    
    if (!pdfData) {
      Alert.alert('Error', 'No hay PDF disponible');
      return;
    }
    
    try {
      const fileUri = FileSystem.documentDirectory + pdfData.filename;
      await FileSystem.writeAsStringAsync(fileUri, pdfData.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Éxito', 'PDF generado correctamente.');
      }
    } catch (error) {
      console.error('Error sharing PDF:', error);
      Alert.alert('Error', 'No se pudo compartir el PDF');
    }
  };

  const closePdfModal = () => {
    setShowPdfModal(false);
    setDistributorPdf(null);
    setClientPdf(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498db" />
          <Text style={styles.loadingText}>Cargando...</Text>
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
          {/* Header with Business Name */}
          <View style={styles.header}>
            {businessConfig?.logo_base64 && (
              <Image source={{ uri: businessConfig.logo_base64 }} style={styles.headerLogo} />
            )}
            <Text style={styles.title}>Nueva Cotización</Text>
            <Text style={styles.subtitle}>
              {businessConfig?.business_name || 'Persianas Enrollables'}
            </Text>
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
            
            {/* Product Picker */}
            <TouchableOpacity
              style={styles.picker}
              onPress={() => setShowProductPicker(true)}
            >
              <Text style={selectedProduct ? styles.pickerText : styles.pickerPlaceholder}>
                {selectedProduct ? selectedProduct.name : 'Seleccionar producto...'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#7f8c8d" />
            </TouchableOpacity>

            {/* Color/Model - Free Text Input */}
            {selectedProduct && (
              <>
                <Text style={styles.inputLabel}>Color / Modelo / Acabado</Text>
                <TextInput
                  style={styles.colorInput}
                  value={colorText}
                  onChangeText={setColorText}
                  placeholder="Ej: Blanco, Madera Nogal, Veteado Gris..."
                  placeholderTextColor="#7f8c8d"
                />
              </>
            )}

            {selectedProduct && (
              <View style={styles.pricesInfoContainer}>
                <View style={styles.priceInfoBox}>
                  <Ionicons name="business" size={16} color="#3498db" />
                  <Text style={styles.priceInfoLabel}>Distribuidor</Text>
                  <Text style={styles.priceInfoValue}>${selectedProduct.distributor_price.toFixed(2)}/m²</Text>
                </View>
                <View style={styles.priceInfoBox}>
                  <Ionicons name="person" size={16} color="#2ecc71" />
                  <Text style={styles.priceInfoLabel}>Cliente</Text>
                  <Text style={styles.priceInfoValueClient}>${selectedProduct.client_price.toFixed(2)}/m²</Text>
                </View>
              </View>
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

            {/* Chain Orientation & Fascia Type */}
            <View style={styles.optionsRow}>
              <View style={styles.optionInput}>
                <Text style={styles.inputLabel}>Cadena</Text>
                <TouchableOpacity
                  style={styles.optionPicker}
                  onPress={() => setShowChainPicker(true)}
                >
                  <Ionicons 
                    name={chainOrientation === 'Izquierda' ? 'arrow-back' : 'arrow-forward'} 
                    size={16} 
                    color="#3498db" 
                  />
                  <Text style={styles.optionText}>{chainOrientation}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.optionInput}>
                <Text style={styles.inputLabel}>Tipo Fascia</Text>
                <TouchableOpacity
                  style={styles.optionPicker}
                  onPress={() => setShowFasciaPicker(true)}
                >
                  <Ionicons name="square-outline" size={16} color="#3498db" />
                  <Text style={styles.optionText} numberOfLines={1}>{fasciaType}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Fascia Color */}
            <View style={styles.optionsRow}>
              <View style={styles.optionInputFull}>
                <Text style={styles.inputLabel}>Color Fascia</Text>
                <TouchableOpacity
                  style={styles.optionPicker}
                  onPress={() => setShowFasciaColorPicker(true)}
                >
                  <View style={[styles.fasciaColorDot, { backgroundColor: getFasciaColorCode(fasciaColor) }]} />
                  <Text style={styles.optionText}>{fasciaColor}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Costs Row - Fascia & Installation */}
            <View style={styles.costsSection}>
              <Text style={styles.costsSectionTitle}>Costos Adicionales (Opcionales)</Text>
              <View style={styles.costsRow}>
                <View style={styles.costInput}>
                  <Text style={styles.inputLabel}>Fascia ($)</Text>
                  <TextInput
                    style={styles.costInputField}
                    value={fasciaPrice}
                    onChangeText={setFasciaPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#7f8c8d"
                  />
                </View>
                <View style={styles.costInput}>
                  <Text style={styles.inputLabel}>Instalación ($)</Text>
                  <TextInput
                    style={[styles.costInputField, styles.installationInput]}
                    value={installationPrice}
                    onChangeText={setInstallationPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#7f8c8d"
                  />
                </View>
              </View>
            </View>

            {/* Subtotal Breakdown */}
            {selectedProduct && width && height && (
              <View style={styles.subtotalSection}>
                <View style={styles.calculatedRow}>
                  <Text style={styles.calculatedLabel}>Producto ({calculateSquareMeters().toFixed(2)} m²):</Text>
                  <Text style={styles.calculatedValue}>
                    ${(calculateSquareMeters() * getPrice(selectedProduct)).toFixed(2)}
                  </Text>
                </View>
                {getFasciaPriceValue() > 0 && (
                  <View style={styles.calculatedRow}>
                    <Text style={styles.calculatedLabel}>Fascia:</Text>
                    <Text style={styles.calculatedValue}>
                      ${getFasciaPriceValue().toFixed(2)}
                    </Text>
                  </View>
                )}
                {getInstallationPriceValue() > 0 && (
                  <View style={styles.calculatedRow}>
                    <Text style={styles.calculatedLabel}>Instalación:</Text>
                    <Text style={styles.calculatedValue}>
                      ${getInstallationPriceValue().toFixed(2)}
                    </Text>
                  </View>
                )}
                <View style={styles.calculatedRow}>
                  <Text style={styles.subtotalLabel}>SUBTOTAL:</Text>
                  <Text style={styles.calculatedValueHighlight}>
                    ${(calculateSquareMeters() * getPrice(selectedProduct) + getFasciaPriceValue() + getInstallationPriceValue()).toFixed(2)}
                  </Text>
                </View>
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
                    {item.color && (
                      <Text style={styles.quoteItemColor}>Color: {item.color}</Text>
                    )}
                    <Text style={styles.quoteItemDetails}>
                      {item.width.toFixed(2)}m × {item.height.toFixed(2)}m = {item.square_meters.toFixed(2)} m²
                    </Text>
                    <Text style={styles.quoteItemOptions}>
                      Cadena: {item.chain_orientation} | Fascia: {item.fascia_type} ({item.fascia_color})
                    </Text>
                    <Text style={styles.quoteItemPrice}>
                      Producto: ${(item.square_meters * item.unit_price).toFixed(2)}
                      {item.fascia_price > 0 && ` | Fascia: $${item.fascia_price.toFixed(2)}`}
                      {item.installation_price > 0 && ` | Inst: $${item.installation_price.toFixed(2)}`}
                    </Text>
                    <Text style={styles.quoteItemSubtotal}>
                      Subtotal: ${item.subtotal.toFixed(2)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeButton}>
                    <Ionicons name="close-circle" size={24} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>TOTAL:</Text>
                <Text style={styles.totalValue}>${getTotal().toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Client Info */}
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
        <Modal visible={showProductPicker} transparent animationType="slide">
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
                      setColorText('');
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

        {/* Chain Orientation Picker Modal */}
        <Modal visible={showChainPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentSmall}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Orientación de Cadena</Text>
                <TouchableOpacity onPress={() => setShowChainPicker(false)}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>
              <View style={styles.optionsList}>
                {CHAIN_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.optionItem, chainOrientation === option && styles.optionItemSelected]}
                    onPress={() => {
                      setChainOrientation(option);
                      setShowChainPicker(false);
                    }}
                  >
                    <Ionicons 
                      name={option === 'Izquierda' ? 'arrow-back' : 'arrow-forward'} 
                      size={24} 
                      color={chainOrientation === option ? '#3498db' : '#7f8c8d'} 
                    />
                    <Text style={[styles.optionItemText, chainOrientation === option && styles.optionItemTextSelected]}>
                      {option}
                    </Text>
                    {chainOrientation === option && (
                      <Ionicons name="checkmark-circle" size={24} color="#2ecc71" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>

        {/* Fascia Type Picker Modal */}
        <Modal visible={showFasciaPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentSmall}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Tipo de Fascia</Text>
                <TouchableOpacity onPress={() => setShowFasciaPicker(false)}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>
              <View style={styles.optionsList}>
                {FASCIA_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.optionItem, fasciaType === option && styles.optionItemSelected]}
                    onPress={() => {
                      setFasciaType(option);
                      setShowFasciaPicker(false);
                    }}
                  >
                    <Ionicons 
                      name={option === 'Redonda' ? 'ellipse-outline' : 'square-outline'} 
                      size={24} 
                      color={fasciaType === option ? '#3498db' : '#7f8c8d'} 
                    />
                    <Text style={[styles.optionItemText, fasciaType === option && styles.optionItemTextSelected]}>
                      {option}
                    </Text>
                    {fasciaType === option && (
                      <Ionicons name="checkmark-circle" size={24} color="#2ecc71" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>

        {/* Fascia Color Picker Modal */}
        <Modal visible={showFasciaColorPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentSmall}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Color de Fascia</Text>
                <TouchableOpacity onPress={() => setShowFasciaColorPicker(false)}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>
              <View style={styles.optionsList}>
                {FASCIA_COLOR_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.optionItem, fasciaColor === option && styles.optionItemSelected]}
                    onPress={() => {
                      setFasciaColor(option);
                      setShowFasciaColorPicker(false);
                    }}
                  >
                    <View style={[styles.fasciaColorDotLarge, { backgroundColor: getFasciaColorCode(option) }]} />
                    <Text style={[styles.optionItemText, fasciaColor === option && styles.optionItemTextSelected]}>
                      {option}
                    </Text>
                    {fasciaColor === option && (
                      <Ionicons name="checkmark-circle" size={24} color="#2ecc71" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getFasciaColorCode(colorName: string): string {
  const colors: { [key: string]: string } = {
    'Negra': '#1a1a1a',
    'Blanca': '#FFFFFF',
    'Gris': '#808080',
    'Café': '#6F4E37',
    'Ivory': '#FFFFF0',
  };
  return colors[colorName] || '#808080';
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
  headerLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#3498db',
    marginTop: 4,
    fontWeight: '600',
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
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  pickerText: {
    color: '#fff',
    fontSize: 15,
  },
  pickerPlaceholder: {
    color: '#7f8c8d',
    fontSize: 15,
  },
  colorInput: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#9b59b6',
  },
  fasciaColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fff',
  },
  fasciaColorDotLarge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
  },
  priceInfo: {
    color: '#2ecc71',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  pricesInfoContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  priceInfoBox: {
    flex: 1,
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  priceInfoLabel: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  priceInfoValue: {
    color: '#3498db',
    fontSize: 16,
    fontWeight: '700',
  },
  priceInfoValueClient: {
    color: '#2ecc71',
    fontSize: 16,
    fontWeight: '700',
  },
  inputLabel: {
    color: '#7f8c8d',
    fontSize: 13,
    marginBottom: 6,
  },
  measurementsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  measurementInput: {
    flex: 1,
  },
  input: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  optionInput: {
    flex: 1,
  },
  optionInputFull: {
    flex: 1,
  },
  optionPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  optionText: {
    color: '#fff',
    fontSize: 13,
  },
  costsSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  costsSectionTitle: {
    color: '#f39c12',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  costsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  costInput: {
    flex: 1,
  },
  costInputField: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#f39c12',
  },
  installationInput: {
    borderColor: '#27ae60',
  },
  subtotalSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  calculatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  calculatedLabel: {
    color: '#7f8c8d',
    fontSize: 14,
  },
  subtotalLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
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
  quoteItemColor: {
    color: '#9b59b6',
    fontSize: 12,
    marginTop: 2,
  },
  quoteItemDetails: {
    color: '#7f8c8d',
    fontSize: 13,
    marginTop: 4,
  },
  quoteItemOptions: {
    color: '#3498db',
    fontSize: 11,
    marginTop: 2,
  },
  quoteItemPrice: {
    color: '#bdc3c7',
    fontSize: 11,
    marginTop: 4,
  },
  quoteItemSubtotal: {
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
  modalContentSmall: {
    backgroundColor: '#16213e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '50%',
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
  optionsList: {
    padding: 16,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    gap: 12,
  },
  optionItemSelected: {
    borderWidth: 2,
    borderColor: '#3498db',
  },
  optionItemText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  optionItemTextSelected: {
    color: '#3498db',
    fontWeight: '600',
  },
});
