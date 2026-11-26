import React from 'react'
import { Platform } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function TabLayout() {
  const insets = useSafeAreaInsets()
  const bottomInset = insets.bottom > 0 ? insets.bottom : 8

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1E62D0',
        tabBarInactiveTintColor: '#64748B',
        tabBarHideOnKeyboard: Platform.OS === 'android',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          borderTopWidth: 1,
          height: 58 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
          elevation: 12,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={22}
              color={(color as string) || '#64748B'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="dependentes"
        options={{
          title: 'Alunos',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              size={22}
              color={(color as string) || '#64748B'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'receipt' : 'receipt-outline'}
              size={22}
              color={(color as string) || '#64748B'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="recarregar"
        options={{
          title: 'Recarregar',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'flash' : 'flash-outline'}
              size={22}
              color={(color as string) || '#64748B'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={22}
              color={(color as string) || '#64748B'}
            />
          ),
        }}
      />

      {/* Rotas ocultas da barra de abas principal */}
      <Tabs.Screen
        name="combo"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="cartoes"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="checkout"
        options={{
          href: null,
        }}
      />
    </Tabs>
  )
}