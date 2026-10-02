import type { Database } from '@/types/database'

export type {
  Category,
  Product,
  Order,
  OrderItem,
  Profile,
  OrderStatus,
  UserRole,
  Database,
  Json,
} from '@/types/database'

export type CartItem = {
  productId: string
  name: string
  price: number
  imageUrl: string | null
  quantity: number
  slug: string
}

export type CheckoutPayload = {
  customerName: string
  phone: string
  address: string
  notes?: string
}

export type ProductInsert = Database['public']['Tables']['products']['Insert']
export type ProductUpdate = Database['public']['Tables']['products']['Update']
export type CategoryInsert = Database['public']['Tables']['categories']['Insert']
export type CategoryUpdate = Database['public']['Tables']['categories']['Update']
