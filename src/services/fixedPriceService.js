/**
 * Service cung cấp giá cố định cho các token
 */
class FixedPriceService {
  constructor() {
    // Danh sách giá cố định các sản phẩm
    this.fixedPrices = {
      "token-1": 100,
      "token-2": 200,
      "token-3": 500,
      "btc": 45000,
      "eth": 2500,
      "sol": 100,
    };
    
    // Dung sai mặc định là 5%
    this.defaultToleranceBps = 500;
  }
  
  /**
   * Lấy giá cố định của một token
   * @param {string} tokenId - ID của token cần lấy giá
   * @returns {number} - Giá của token
   */
  getTokenPrice(tokenId) {
    const price = this.fixedPrices[tokenId];
    if (!price) {
      console.warn(`Không tìm thấy giá cho token: ${tokenId}. Trả về giá mặc định 100.`);
      return 100;
    }
    return price;
  }
  
  /**
   * Tính khoảng dung sai của một giá
   * @param {number} price - Giá cần tính dung sai
   * @param {number} toleranceBps - Dung sai tính bằng basis points (1/100 phần trăm), mặc định là 500 (5%)
   * @returns {object} - Khoảng giá chấp nhận được (min, max)
   */
  calculatePriceRange(price, toleranceBps = this.defaultToleranceBps) {
    const tolerancePercentage = toleranceBps / 10000; // Chuyển từ basis points sang phần trăm
    const toleranceAmount = price * tolerancePercentage;
    
    return {
      min: price - toleranceAmount,
      max: price + toleranceAmount,
      tolerance: tolerancePercentage * 100 // Phần trăm thực tế (ví dụ: 5.00)
    };
  }
  
  /**
   * Kiểm tra xem một giá có nằm trong khoảng dung sai không
   * @param {number} actualPrice - Giá thực tế
   * @param {number} expectedPrice - Giá kỳ vọng
   * @param {number} toleranceBps - Dung sai tính bằng basis points, mặc định là 500 (5%)
   * @returns {boolean} - true nếu giá nằm trong khoảng dung sai
   */
  isPriceWithinTolerance(actualPrice, expectedPrice, toleranceBps = this.defaultToleranceBps) {
    const range = this.calculatePriceRange(actualPrice, toleranceBps);
    return expectedPrice >= range.min && expectedPrice <= range.max;
  }
}

module.exports = new FixedPriceService(); 