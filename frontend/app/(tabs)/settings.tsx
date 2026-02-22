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
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface BusinessConfig {
  id: string;
  business_name: string;
  phone: string;
  email: string;
  address: string;
  logo_base64: string | null;
}

export default function SettingsScreen() {
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [logo, setLogo] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/config`);
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        setBusinessName(data.business_name || '');
        setPhone(data.phone || '');
        setEmail(data.email || '');
        setAddress(data.address || '');
        setLogo(data.logo_base64);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
      Alert.alert('Error', 'No se pudo cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para seleccionar un logo');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setLogo(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const removeLogo = () => {
    setLogo(null);
  };

  const saveConfig = async () => {
    if (!businessName.trim()) {
      Alert.alert('Error', 'El nombre del negocio es requerido');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          logo_base64: logo,
        }),
      });

      if (response.ok) {
        Alert.alert('Éxito', 'Configuración guardada correctamente');
        fetchConfig();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      Alert.alert('Error', 'No se pudo guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498db" />
          <Text style={styles.loadingText}>Cargando configuración...</Text>
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
        <ScrollView style={styles.scrollView}>
          <View style={styles.header}>
            <Ionicons name="settings" size={40} color="#3498db" />
            <Text style={styles.title}>Configuración</Text>
            <Text style={styles.subtitle}>Personaliza tu negocio</Text>
          </View>

          {/* Logo Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Logo del Negocio</Text>
            
            <View style={styles.logoContainer}>
              {logo ? (
                <View style={styles.logoWrapper}>
                  <Image source={{ uri: logo }} style={styles.logoImage} />
                  <TouchableOpacity style={styles.removeLogoButton} onPress={removeLogo}>
                    <Ionicons name="close-circle" size={28} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Ionicons name="image-outline" size={50} color="#7f8c8d" />
                  <Text style={styles.logoPlaceholderText}>Sin logo</Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
              <Ionicons name="cloud-upload" size={20} color="#fff" />
              <Text style={styles.uploadButtonText}>
                {logo ? 'Cambiar Logo' : 'Subir Logo'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Business Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Información del Negocio</Text>

            <Text style={styles.inputLabel}>Nombre del Negocio</Text>
            <TextInput
              style={styles.input}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Ej: Mi Empresa de Persianas"
              placeholderTextColor="#7f8c8d"
            />

            <Text style={styles.inputLabel}>Teléfono</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+52 555 123 4567"
              placeholderTextColor="#7f8c8d"
              keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="contacto@minegocio.com"
              placeholderTextColor="#7f8c8d"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Dirección</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={address}
              onChangeText={setAddress}
              placeholder="Calle, Número, Colonia, Ciudad"
              placeholderTextColor="#7f8c8d"
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Preview Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vista Previa</Text>
            <View style={styles.previewCard}>
              {logo && (
                <Image source={{ uri: logo }} style={styles.previewLogo} />
              )}
              <Text style={styles.previewName}>{businessName || 'Nombre del Negocio'}</Text>
              <Text style={styles.previewInfo}>{phone || 'Teléfono'}</Text>
              <Text style={styles.previewInfo}>{email || 'Email'}</Text>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveConfig}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.saveButtonText}>Guardar Configuración</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </ScrollView>
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
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    marginTop: 4,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoWrapper: {
    position: 'relative',
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#3498db',
  },
  removeLogoButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#16213e',
    borderRadius: 14,
  },
  logoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0f3460',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3498db',
    borderStyle: 'dashed',
  },
  logoPlaceholderText: {
    color: '#7f8c8d',
    fontSize: 12,
    marginTop: 4,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3498db',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
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
    height: 70,
    textAlignVertical: 'top',
  },
  previewCard: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  previewLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 12,
  },
  previewName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  previewInfo: {
    fontSize: 13,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27ae60',
    borderRadius: 12,
    padding: 18,
    marginHorizontal: 20,
    gap: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 30,
  },
});
