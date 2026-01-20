export interface Order {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  total: number;
  customerName: string;
  customerPhone?: string;
  orderType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  paymentMethod?: string;
  changeFor?: number;
  notes?: string;
  deliveryFee?: number;
  discountAmount?: number;
  customerId?: string;
  kitchenReceiptAutoPrintedAt?: string | null;
  address?: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    cep?: string;
  };
  items: OrderItem[];
  promotion?: {
    name?: string;
    type?: string;
    value?: number;
  };
  coupon?: {
    code?: string;
  };
}

export interface OrderItem {
  id: string;
  quantity: number;
  price?: number;
  productId?: string;
  comboId?: string;
  product?: {
    id: string;
    name: string;
    price: number;
  };
  notes?: string;
}

export interface GroupedOrderItem {
    id?: string;
    type: 'product' | 'combo';
    name: string;
    quantity: number;
    price: number;
    totalPrice: number;
    notes?: string;
    comboId?: string;
    comboItems?: Array<{
      quantity: number;
      productName: string;
    }>;
    product?: {
      id: string;
      name: string;
      price: number;
    };
}

export interface PollingResponse {
  success: boolean;
  data: {
    orders: Order[];
    count: number;
    timestamp: string;
  };
  error?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

