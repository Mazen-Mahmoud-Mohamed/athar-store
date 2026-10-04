export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'customer' | 'admin'

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export type PaymentMethod = 'cod' | 'xpay'

export type PaymentStatus =
  | 'pending'
  | 'requires_action'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'expired'

export type Profile = {
  id: string
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export type Category = {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type Product = {
  id: string
  category_id: string | null
  name: string
  slug: string
  description: string | null
  price: number
  old_price: number | null
  image_url: string | null
  is_active: boolean
  is_featured: boolean
  is_new: boolean
  stock_quantity: number
  created_at: string
  updated_at: string
  category?: Category | null
}

export type Order = {
  id: string
  customer_name: string
  phone: string
  address: string
  notes: string | null
  status: OrderStatus
  subtotal: number
  total: number
  payment_method?: PaymentMethod
  payment_status?: PaymentStatus
  created_at: string
  updated_at: string
  items?: OrderItem[]
}

export type Payment = {
  id: string
  order_id: string
  provider: string
  provider_session_id: string | null
  provider_payment_intent_id: string | null
  amount: number
  currency: string
  status: PaymentStatus
  provider_status: string | null
  provider_payment_status: string | null
  guest_token: string
  idempotency_key: string | null
  stock_released: boolean
  metadata: Json
  created_at: string
  updated_at: string
}

export type OrderItem = {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  unit_price: number
  quantity: number
  subtotal: number
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: {
          id: string
          full_name?: string | null
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: Category
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: Product
        Insert: {
          id?: string
          category_id?: string | null
          name: string
          slug: string
          description?: string | null
          price: number
          old_price?: number | null
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_new?: boolean
          stock_quantity?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category_id?: string | null
          name?: string
          slug?: string
          description?: string | null
          price?: number
          old_price?: number | null
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_new?: boolean
          stock_quantity?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      orders: {
        Row: Order
        Insert: {
          id?: string
          customer_name: string
          phone: string
          address: string
          notes?: string | null
          status?: OrderStatus
          subtotal: number
          total: number
          payment_method?: PaymentMethod
          payment_status?: PaymentStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_name?: string
          phone?: string
          address?: string
          notes?: string | null
          status?: OrderStatus
          subtotal?: number
          total?: number
          payment_method?: PaymentMethod
          payment_status?: PaymentStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: Payment
        Insert: {
          id?: string
          order_id: string
          provider?: string
          provider_session_id?: string | null
          provider_payment_intent_id?: string | null
          amount: number
          currency?: string
          status?: PaymentStatus
          provider_status?: string | null
          provider_payment_status?: string | null
          guest_token?: string
          idempotency_key?: string | null
          stock_released?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          provider?: string
          provider_session_id?: string | null
          provider_payment_intent_id?: string | null
          amount?: number
          currency?: string
          status?: PaymentStatus
          provider_status?: string | null
          provider_payment_status?: string | null
          guest_token?: string
          idempotency_key?: string | null
          stock_released?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
        ]
      }
      order_items: {
        Row: OrderItem
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          unit_price: number
          quantity: number
          subtotal: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          unit_price?: number
          quantity?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      create_guest_order: {
        Args: {
          p_customer_name: string
          p_phone: string
          p_address: string
          p_notes?: string | null
          p_items: Json
          p_payment_method?: PaymentMethod
        }
        Returns: Json
      }
      mark_xpay_order_paid: {
        Args: {
          p_payment_id: string
          p_provider_session_id?: string | null
          p_provider_payment_intent_id?: string | null
          p_provider_status?: string | null
          p_provider_payment_status?: string | null
        }
        Returns: Json
      }
      cancel_unpaid_xpay_order: {
        Args: {
          p_payment_id: string
          p_payment_status: PaymentStatus
          p_provider_session_id?: string | null
          p_provider_status?: string | null
          p_provider_payment_status?: string | null
        }
        Returns: Json
      }
      cancel_xpay_order_without_payment: {
        Args: {
          p_order_id: string
        }
        Returns: Json
      }
      is_allowed_order_status_transition: {
        Args: {
          p_from: OrderStatus
          p_to: OrderStatus
        }
        Returns: boolean
      }
      admin_update_order_status: {
        Args: {
          p_order_id: string
          p_status: OrderStatus
        }
        Returns: Database['public']['Tables']['orders']['Row']
      }
    }
    Enums: {
      order_status: OrderStatus
      user_role: UserRole
      payment_method: PaymentMethod
      payment_status: PaymentStatus
    }
    CompositeTypes: Record<string, never>
  }
}
