import { Factory, Sequence } from '@stratal/framework/factory'

interface Product {
  id: string
  sku: string
  name: string
  price: number
  category: string
  inStock: boolean
}

type ProductCreateInput = Omit<Product, 'id'>

const skuSequence = new Sequence((n) => `SKU-${String(n).padStart(6, '0')}`)

export class ProductFactory extends Factory<Product, ProductCreateInput> {
  protected model = 'product'

  protected definition(): ProductCreateInput {
    return {
      sku: skuSequence.next(),
      name: this.faker.commerce.productName(),
      price: parseFloat(this.faker.commerce.price({ min: 5, max: 500 })),
      category: this.faker.commerce.department(),
      inStock: true,
    }
  }

  outOfStock() {
    return this.state(() => ({ inStock: false }))
  }

  expensive() {
    return this.state(() => ({
      price: parseFloat(this.faker.commerce.price({ min: 500, max: 5000 })),
    }))
  }

  inCategory(category: string) {
    return this.state(() => ({ category }))
  }
}
