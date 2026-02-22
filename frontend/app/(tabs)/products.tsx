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
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Product {
  id: string;
  name: string;
  description: string;
  distributor_price: number;
  client_price: number;
}

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [distributorPrice, setDistributorPrice] = useState('');
  const [clientPrice, setClientPrice] = useState('');
  const [marginPercent, setMarginPercent] = useState('30'); // Default 30% margin

  const fetchProducts = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/products`);
      if (response.ok) {
        const data = await response.json();
        if (data.length === 0) {
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

  const openAddModal = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setDistributorPrice('');
    setClientPrice('');
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description);
    setDistributorPrice(product.distributor_price.toString());
    setClientPrice(product.client_price.toString());
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
  };

  const saveProduct = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'El nombre es requerido');
      return;
    }
    
    const distPrice = parseFloat(distributorPrice);
    const cliPrice = parseFloat(clientPrice);
    
    if (isNaN(distPrice) || isNaN(cliPrice) || distPrice <= 0 || cliPrice <= 0) {
      Alert.alert('Error', 'Los precios deben ser números válidos mayores a 0');
      return;
    }
    
    setSaving(true);
    
    try {
      const productData = {
        name: name.trim(),
        description: description.trim(),
        distributor_price: distPrice,
        client_price: cliPrice,
      };
      
      let response;
      
      if (editingProduct) {
        response = await fetch(`${BACKEND_URL}/api/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(productData),
        });
      } else {
        response = await fetch(`${BACKEND_URL}/api/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(productData),
        });
      }
      
      if (response.ok) {
        Alert.alert('Éxito', editingProduct ? 'Producto actualizado' : 'Producto creado');
        closeModal();
        fetchProducts();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      console.error('Error saving product:', error);
      Alert.alert('Error', 'No se pudo guardar el producto');
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = (product: Product) => {
    Alert.alert(
      'Eliminar Producto',
      `¿Estás seguro de que deseas eliminar "${product.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${BACKEND_URL}/api/products/${product.id}`, {
                method: 'DELETE',
              });
              
              if (response.ok) {
                Alert.alert('Éxito', 'Producto eliminado');
                fetchProducts();
              } else {
                throw new Error('Error al eliminar');
              }
            } catch (error) {
              console.error('Error deleting product:', error);
              Alert.alert('Error', 'No se pudo eliminar el producto');
            }
          },
        },
      ]
    );
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
      <View style={styles.header}>
        <Text style={styles.title}>Productos</Text>
        <Text style={styles.subtitle}>Gestiona tu catálogo de persianas</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3498db" />
        }
      >
        {products.map((product) => (
          <View key={product.id} style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productDescription}>{product.description}</Text>
              <View style={styles.pricesContainer}>
                <View style={styles.priceBox}>
                  <Text style={styles.priceLabel}>Distribuidor</Text>
                  <Text style={styles.priceValue}>${product.distributor_price.toFixed(2)}/m²</Text>
                </View>
                <View style={styles.priceBox}>
                  <Text style={styles.priceLabel}>Cliente</Text>
                  <Text style={styles.priceValueClient}>${product.client_price.toFixed(2)}/m²</Text>
                </View>
              </View>
            </View>
            <View style={styles.productActions}>
              <TouchableOpacity 
                style={styles.editButton}
                onPress={() => openEditModal(product)}
              >
                <Ionicons name="pencil" size={20} color="#3498db" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.deleteButton}
                onPress={() => deleteProduct(product)}
              >
                <Ionicons name="trash" size={20} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Floating Add Button */}
      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Nombre del Producto</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Ej: Persiana Enrollable Blackout"
                placeholderTextColor="#7f8c8d"
              />

              <Text style={styles.inputLabel}>Descripción</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Descripción del producto..."
                placeholderTextColor="#7f8c8d"
                multiline
                numberOfLines={3}
              />

              <View style={styles.pricesRow}>
                <View style={styles.priceInputContainer}>
                  <Text style={styles.inputLabel}>Precio Distribuidor ($/m²)</Text>
                  <TextInput
                    style={styles.input}
                    value={distributorPrice}
                    onChangeText={setDistributorPrice}
                    placeholder="0.00"
                    placeholderTextColor="#7f8c8d"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.priceInputContainer}>
                  <Text style={styles.inputLabel}>Precio Cliente ($/m²)</Text>
                  <TextInput
                    style={styles.input}
                    value={clientPrice}
                    onChangeText={setClientPrice}
                    placeholder="0.00"
                    placeholderTextColor="#7f8c8d"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <TouchableOpacity 
                style={styles.saveButton} 
                onPress={saveProduct}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={22} color="#fff" />
                    <Text style={styles.saveButtonText}>
                      {editingProduct ? 'Actualizar' : 'Guardar'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
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
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  productCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  productDescription: {
    fontSize: 13,
    color: '#7f8c8d',
    marginTop: 6,
    lineHeight: 18,
  },
  pricesContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  priceBox: {
    backgroundColor: '#0f3460',
    borderRadius: 8,
    padding: 10,
    minWidth: 100,
  },
  priceLabel: {
    fontSize: 11,
    color: '#7f8c8d',
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3498db',
    marginTop: 2,
  },
  priceValueClient: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2ecc71',
    marginTop: 2,
  },
  productActions: {
    justifyContent: 'center',
    gap: 12,
  },
  editButton: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 10,
  },
  deleteButton: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 10,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#3498db',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3498db',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomPadding: {
    height: 100,
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
    maxHeight: '85%',
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
  modalForm: {
    padding: 20,
  },
  inputLabel: {
    color: '#7f8c8d',
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pricesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  priceInputContainer: {
    flex: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27ae60',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 30,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
