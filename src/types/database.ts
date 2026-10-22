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
  phone: string | null
  default_address: string | null
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
  customer_id: string | null
  cancellation_requested_at: string | null
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

export type ProductReview = {
  id: string
  order_item_id: string
  order_id: string
  product_id: string
  customer_id: string
  rating: number
  comment: string | null
  photo_path: string | null
  status: 'pending' | 'approved' | 'hidden'
  show_author_name: boolean
  author_display_name: string | null
  moderated_by: string | null
  moderated_at: string | null
  created_at: string
  updated_at: string
}

export type Database = {
  public: {
    Tables: {
      product_reviews: {
        Row: ProductReview
        Insert: {
          id?: string
          order_item_id: string
          order_id: string
          product_id: string
          customer_id: string
          rating: number
          comment?: string | null
          photo_path?: string | null
          status?: ProductReview['status']
          show_author_name?: boolean
          author_display_name?: string | null
          moderated_by?: string | null
          moderated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          rating?: number
          comment?: string | null
          photo_path?: string | null
          status?: ProductReview['status']
          show_author_name?: boolean
          author_display_name?: string | null
          moderated_by?: string | null
          moderated_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
          phone?: string | null
          default_address?: string | null
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
      submit_product_review: {
        Args: { p_order_item_id: string; p_rating: number; p_comment?: string | null; p_show_author_name?: boolean }
        Returns: ProductReview
      }
      get_product_reviews_with_names: {
        Args: { p_product_id: string }
        Returns: { review_id: string; rating: number; comment: string | null; photo_path: string | null; created_at: string; display_name: string | null }[]
      }
      attach_product_review_photo: {
        Args: { p_review_id: string; p_path: string }
        Returns: undefined
      }
      get_product_reviews: {
        Args: { p_product_id: string }
        Returns: {
          review_id: string
          rating: number
          comment: string | null
          photo_path: string | null
          created_at: string
        }[]
      }
      get_product_rating_summary: {
        Args: { p_product_id: string }
        Returns: { average_rating: number; review_count: number }[]
      }
      admin_moderate_product_review: {
        Args: { p_review_id: string; p_action: string }
        Returns: undefined
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      create_customer_order: {
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
      customer_cancel_order: {
        Args: { p_order_id: string }
        Returns: Order
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
