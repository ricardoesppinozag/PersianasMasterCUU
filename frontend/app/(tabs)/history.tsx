import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface QuoteItem {
  product_id: string;
  product_name: string;
  width: number;
  height: number;
  square_meters: number;
  unit_price: number;
  subtotal: number;
}

interface Quote {
  id: string;
  items: QuoteItem[];
  total: number;
  client_type: string;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  notes?: string;
  created_at: string;
}

export default function HistoryScreen() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchQuotes = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/quotes`);
      if (response.ok) {
        const data = await response.json();
        setQuotes(data);
      }
    } catch (error) {
      console.error('Error fetching quotes:', error);
      Alert.alert('Error', 'No se pudieron cargar las cotizaciones');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchQuotes();
  }, [fetchQuotes]);

  const downloadPDF = async (quote: Quote) => {
    setDownloadingId(quote.id);
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/quotes/${quote.id}/pdf`);
      
      if (!response.ok) {
        throw new Error('Error al generar PDF');
      }
      
      const pdfData = await response.json();
      
      const fileUri = FileSystem.documentDirectory + pdfData.filename;
      await FileSystem.writeAsStringAsync(fileUri, pdfData.pdf_base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Éxito', 'PDF generado correctamente');
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      Alert.alert('Error', 'No se pudo descargar el PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const deleteQuote = (quote: Quote) => {
    Alert.alert(
      'Eliminar Cotización',
      '¿Estás seguro de que deseas eliminar esta cotización?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${BACKEND_URL}/api/quotes/${quote.id}`, {
                method: 'DELETE',
              });
              
              if (response.ok) {
                Alert.alert('Éxito', 'Cotización eliminada');
                fetchQuotes();
              } else {
                throw new Error('Error al eliminar');
              }
            } catch (error) {
              console.error('Error deleting quote:', error);
              Alert.alert('Error', 'No se pudo eliminar la cotización');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498db" />
          <Text style={styles.loadingText}>Cargando historial...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historial</Text>
        <Text style={styles.subtitle}>Cotizaciones guardadas</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3498db" />
        }
      >
        {quotes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#7f8c8d" />
            <Text style={styles.emptyText}>No hay cotizaciones guardadas</Text>
            <Text style={styles.emptySubtext}>Las cotizaciones que guardes aparecerán aquí</Text>
          </View>
        ) : (
          quotes.map((quote) => (
            <View key={quote.id} style={styles.quoteCard}>
              <View style={styles.quoteHeader}>
                <View style={styles.quoteHeaderLeft}>
                  <Text style={styles.quoteId}>#{quote.id.slice(0, 8).toUpperCase()}</Text>
                  <View style={[
                    styles.clientTypeBadge,
                    quote.client_type === 'distributor' ? styles.distributorBadge : styles.clientBadge
                  ]}>
                    <Text style={styles.clientTypeText}>
                      {quote.client_type === 'distributor' ? 'Distribuidor' : 'Cliente'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.quoteDate}>{formatDate(quote.created_at)}</Text>
              </View>

              {quote.client_name && (
                <View style={styles.clientInfo}>
                  <Ionicons name="person" size={16} color="#7f8c8d" />
                  <Text style={styles.clientName}>{quote.client_name}</Text>
                </View>
              )}

              <View style={styles.itemsPreview}>
                {quote.items.slice(0, 2).map((item, index) => (
                  <Text key={index} style={styles.itemPreviewText}>
                    • {item.product_name} ({item.square_meters.toFixed(2)} m²)
                  </Text>
                ))}
                {quote.items.length > 2 && (
                  <Text style={styles.moreItems}>+{quote.items.length - 2} más...</Text>
                )}
              </View>

              <View style={styles.quoteFooter}>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>${quote.total.toFixed(2)}</Text>
                </View>
                
                <View style={styles.actions}>
                  <TouchableOpacity 
                    style={styles.pdfButton}
                    onPress={() => downloadPDF(quote)}
                    disabled={downloadingId === quote.id}
                  >
                    {downloadingId === quote.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="download" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.deleteButtonSmall}
                    onPress={() => deleteQuote(quote)}
                  >
                    <Ionicons name="trash" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
        
        <View style={styles.bottomPadding} />
      </ScrollView>
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    color: '#7f8c8d',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#5d6d7e',
    marginTop: 8,
  },
  quoteCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quoteHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quoteId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  clientTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  distributorBadge: {
    backgroundColor: '#3498db',
  },
  clientBadge: {
    backgroundColor: '#9b59b6',
  },
  clientTypeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  quoteDate: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  clientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  clientName: {
    fontSize: 14,
    color: '#fff',
  },
  itemsPreview: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  itemPreviewText: {
    fontSize: 13,
    color: '#bdc3c7',
    marginBottom: 4,
  },
  moreItems: {
    fontSize: 12,
    color: '#7f8c8d',
    fontStyle: 'italic',
    marginTop: 4,
  },
  quoteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalBox: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  totalLabel: {
    fontSize: 11,
    color: '#7f8c8d',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2ecc71',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  pdfButton: {
    backgroundColor: '#3498db',
    borderRadius: 10,
    padding: 12,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonSmall: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    padding: 12,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomPadding: {
    height: 30,
  },
});
