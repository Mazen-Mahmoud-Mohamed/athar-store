export {
  getActiveProducts,
  getFeaturedProducts,
  getNewProducts,
  getProductsByCategory,
  getProductById,
  getProductBySlug,
  searchProducts,
  adminGetAllProducts,
  adminGetProductById,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  uploadProductImage,
} from '@/services/productService'

export {
  getActiveCategories,
  getCategoryBySlug,
  adminGetAllCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
} from '@/services/categoryService'
