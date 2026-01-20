import { Order, OrderItem, GroupedOrderItem } from '../types';

/**
 * Agrupa itens de pedido similar ao frontend
 */
function groupOrderItems(items: OrderItem[]): GroupedOrderItem[] {
  const grouped: GroupedOrderItem[] = [];
  const processedComboItemIds = new Set<string>();
  const comboCounter = new Map<string, number>();

  // Processar itens principais de combo
  items.forEach((item) => {
    if (item.comboId && !item.productId && item.price && item.price > 0) {
      if (!comboCounter.has(item.comboId)) {
        comboCounter.set(item.comboId, comboCounter.size + 1);
      }
      const comboNumber = comboCounter.get(item.comboId)!;

      const comboItems: Array<{
        productName: string;
        quantity: number;
      }> = [];

      items.forEach((subItem) => {
        if (
          subItem.comboId === item.comboId &&
          subItem.productId &&
          subItem.product
        ) {
          processedComboItemIds.add(subItem.id);
          comboItems.push({
            productName: subItem.product.name,
            quantity: subItem.quantity,
          });
        }
      });

      grouped.push({
        id: item.id,
        type: 'combo',
        name: `Combo ${comboNumber}`,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.price * item.quantity,
        notes: item.notes,
        comboId: `c${comboNumber}`,
        comboItems,
      });
    }
  });

  // Processar produtos individuais
  items.forEach((item) => {
    if (processedComboItemIds.has(item.id)) {
      return;
    }

    if (item.comboId && item.price === 0) {
      return;
    }

    if (item.productId && item.product) {
      grouped.push({
        id: item.id,
        type: 'product',
        name: item.product.name,
        quantity: item.quantity,
        price: item.price || item.product.price,
        totalPrice: (item.price || item.product.price) * item.quantity,
        notes: item.notes,
        product: {
          id: item.product.id,
          name: item.product.name,
          price: item.product.price,
        },
      });
    }
  });

  return grouped;
}

/**
 * Formata data no padrão brasileiro
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const day = date.getDate().toString().padStart(2, '0');
    const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const month = monthNames[date.getMonth()];
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${day}/${month} - ${hours}:${minutes}`;
  } catch (error) {
    return '';
  }
}

/**
 * Formata data atual
 */
function formatCurrentDate(): string {
  try {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (error) {
    return '';
  }
}

/**
 * Formata telefone
 */
function formatPhone(phone?: string | null): string {
  if (!phone) return '-';
  const numbers = phone.replace(/\D/g, '');
  if (numbers.length === 11) {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
  } else if (numbers.length === 10) {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
  }
  return phone;
}

/**
 * Formata moeda
 */
function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'R$ 0,00';
  }
  const numValue = Number(value);
  if (isNaN(numValue)) {
    return 'R$ 0,00';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numValue);
}

/**
 * Obtém label do tipo de pedido
 */
function getOrderTypeLabel(orderType: string): string {
  switch (orderType) {
    case 'DELIVERY':
      return 'ENTREGA';
    case 'PICKUP':
      return 'RETIRADA';
    case 'DINE_IN':
      return 'COMER NO LOCAL';
    default:
      return 'ENTREGA';
  }
}

/**
 * Obtém número do pedido (últimos 8 caracteres)
 */
function getOrderNumber(orderId: string): string {
  return orderId.slice(-8);
}

/**
 * Obtém linhas de endereço completo
 */
function getFullAddressLines(order: Order): string[] {
  if (order.orderType === 'DELIVERY' && order.address) {
    const addr = order.address;
    const lines: string[] = [];

    if (addr.street) {
      let streetLine = addr.street;
      if (addr.number) {
        streetLine += `, ${addr.number}`;
      }
      if (addr.complement) {
        streetLine += `, ${addr.complement}`;
      }
      lines.push(streetLine);
    }

    if (addr.neighborhood) {
      lines.push(`Bairro: ${addr.neighborhood}`);
    }

    if (addr.city) {
      const cityState = addr.state ? `${addr.city} - ${addr.state}` : addr.city;
      lines.push(cityState);
    }

    if (addr.cep) {
      lines.push(`CEP: ${addr.cep}`);
    }

    return lines;
  }
  return [];
}

/**
 * Formata recibo completo em texto para impressão ESC/POS
 */
export function formatReceipt(order: Order, restaurantName: string): string {
  const separatorLine = '='.repeat(32);
  const dividerLine = '-'.repeat(32);
  const lines: string[] = [];

  // Cabeçalho
  lines.push(separatorLine);
  lines.push(getOrderTypeLabel(order.orderType));
  lines.push(separatorLine);
  lines.push(`Emissao: ${formatDate(order.createdAt)}`);
  lines.push(`Data atual: ${formatCurrentDate()}`);
  lines.push('');

  // Informações do Pedido
  lines.push(dividerLine);
  lines.push(`Pedido: #${getOrderNumber(order.id)}`);
  lines.push(`Cliente: ${order.customerName}`);
  lines.push(`Tel: ${formatPhone(order.customerPhone)}`);
  lines.push(`Tipo: ${getOrderTypeLabel(order.orderType)}`);
  lines.push('');

  // Endereço (se DELIVERY)
  if (order.orderType === 'DELIVERY') {
    const addressLines = getFullAddressLines(order);
    if (addressLines.length > 0) {
      addressLines.forEach((line) => {
        lines.push(line);
      });
      lines.push('');
    }
  }

  // Itens do Pedido
  lines.push(dividerLine);
  lines.push('Qt. Descricao');
  lines.push(dividerLine);

  const groupedItems = groupOrderItems(order.items);
  groupedItems.forEach((item) => {
    if (item.type === 'combo') {
      lines.push(`Combo ${item.comboId} - ${item.quantity}x`);
      if (item.comboItems && item.comboItems.length > 0) {
        lines.push('Inclui:');
        item.comboItems.forEach((comboItem) => {
          lines.push(`  • ${comboItem.quantity}x ${comboItem.productName}`);
        });
      }
      if (item.notes) {
        lines.push(`(${item.notes})`);
      }
      lines.push(`Total: ${formatCurrency(item.totalPrice)}`);
    } else {
      lines.push(`${item.quantity}x ${item.name}`);
      if (item.notes) {
        lines.push(`(${item.notes})`);
      }
      lines.push(`${formatCurrency(item.price)} x ${item.quantity} = ${formatCurrency(item.totalPrice)}`);
    }
    lines.push('');
  });

  // Quantidade de Itens
  const totalItems = order.items.reduce((sum, item) => {
    if (item.comboId && !item.productId) {
      return sum;
    }
    return sum + item.quantity;
  }, 0);
  lines.push(dividerLine);
  lines.push(`Qtd. itens: ${'-'.repeat(10)} ${totalItems}`);
  lines.push('');

  // Resumo de Valores
  lines.push(dividerLine);
  const subtotal = order.items.reduce((sum, item) => {
    const unitPrice = item.price != null
      ? Number(item.price)
      : item.product?.price != null
      ? Number(item.product.price)
      : 0;
    return sum + unitPrice * item.quantity;
  }, 0);

  const formattedSubtotal = Number(subtotal.toFixed(2));
  lines.push(`Subtotal:${' '.repeat(20)}${formatCurrency(formattedSubtotal)}`);

  // Desconto de promoção
  const promotionDiscount = (() => {
    if (!order.promotion || !order.promotion.value) return 0;
    const promotion = order.promotion;
    if (promotion.type === 'PERCENTAGE') {
      return Number((formattedSubtotal * (Number(promotion.value) / 100)).toFixed(2));
    } else if (promotion.type === 'FIXED') {
      return Number(Math.min(Number(promotion.value), formattedSubtotal).toFixed(2));
    }
    return 0;
  })();

  if (promotionDiscount > 0) {
    const promoName = order.promotion?.name ? `: ${order.promotion.name}` : '';
    lines.push(`Promocao${promoName}:${' '.repeat(15)}-${formatCurrency(promotionDiscount)}`);
  }

  // Desconto de cupom
  const totalDiscountAmount = order.discountAmount ? Number(order.discountAmount) : 0;
  const couponDiscount = Number(Math.max(0, totalDiscountAmount - promotionDiscount).toFixed(2));
  if (couponDiscount > 0) {
    const couponCode = order.coupon?.code ? `: ${order.coupon.code}` : '';
    lines.push(`Cupom${couponCode}:${' '.repeat(18)}-${formatCurrency(couponDiscount)}`);
  }

  // Taxa de entrega
  const deliveryFee = order.orderType === 'DELIVERY' ? Number(order.deliveryFee || 0) : 0;
  if (deliveryFee > 0) {
    lines.push(`Taxa de entrega:${' '.repeat(15)}${formatCurrency(deliveryFee)}`);
  }

  lines.push(separatorLine);
  const total = Number(order.total || 0);
  lines.push(`TOTAL:${' '.repeat(25)}${formatCurrency(total)}`);
  lines.push(separatorLine);
  lines.push('');

  // Informações Adicionais
  if (order.paymentMethod) {
    lines.push(`Pagamento: ${order.paymentMethod}`);
  }
  if (order.changeFor && Number(order.changeFor) > 0) {
    lines.push(`Troco para: ${formatCurrency(order.changeFor)}`);
  }
  if (order.notes) {
    lines.push(`Observacoes: ${order.notes}`);
  }
  lines.push('');

  // Informações da Plataforma
  const orderIdShort = order.id.slice(-9);
  lines.push(`Cardapix nº ${orderIdShort}`);
  lines.push(restaurantName);
  lines.push('');

  // Rodapé
  lines.push(`ID. do pedido: ${orderIdShort}`);
  lines.push(`ID: ${orderIdShort} | Usr: ${order.customerId?.slice(-6) || '000000'}`);
  lines.push('www.cardapix.com');

  return lines.join('\n');
}

