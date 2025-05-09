const { Connection, PublicKey } = require('@solana/web3.js');
const switchboardService = require('./services/switchboardService');
const priceApi = require('./services/priceApi');

class TransferHook {
  constructor() {
    this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
    this.priceTolerance = parseFloat(process.env.PRICE_TOLERANCE) || 0.1; // 10% mặc định
  }

  // Validate transfer dựa trên giá từ Switchboard
  async validateTransfer(amount, productId, variant) {
    try {
      // Lấy feed ID tương ứng
      const feedId = this.getFeedId(productId, variant);
      
      // Lấy giá từ Switchboard
      const switchboardPrice = await switchboardService.getCurrentPrice(feedId);
      
      // Lấy giá tham chiếu từ API
      const variantConfig = variant ? `ram=${variant.ram},storage=${variant.storage}` : null;
      const referencePrice = await priceApi.getProductPrice(productId, 'phonespecs', variantConfig);
      
      // Tính toán khoảng giá cho phép
      const minPrice = referencePrice * (1 - this.priceTolerance);
      const maxPrice = referencePrice * (1 + this.priceTolerance);
      
      console.log(`Kiểm tra giá:
      - Giá chuyển khoản: ${amount}
      - Giá tham chiếu: ${referencePrice}
      - Khoảng giá hợp lệ: ${minPrice} - ${maxPrice}`);
      
      // Kiểm tra xem giá có nằm trong khoảng cho phép không
      if (amount < minPrice || amount > maxPrice) {
        throw new Error(`Giá chuyển khoản ${amount} không hợp lệ. Khoảng giá cho phép: ${minPrice} - ${maxPrice}`);
      }
      
      return {
        success: true,
        message: 'Giá chuyển khoản hợp lệ',
        data: {
          transferAmount: amount,
          referencePrice,
          minValidPrice: minPrice,
          maxValidPrice: maxPrice
        }
      };
    } catch (error) {
      console.error('Lỗi khi validate transfer:', error);
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  // Tạo feed ID từ product ID và variant
  getFeedId(productId, variant) {
    if (variant && variant.ram && variant.storage) {
      return `${productId}-${variant.ram}-${variant.storage}`.replace(/ /g, '-');
    }
    return productId;
  }
}

module.exports = new TransferHook(); 