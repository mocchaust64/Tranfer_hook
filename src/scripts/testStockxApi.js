const StockXAPI = require("stockx-api");
require('dotenv').config();

/**
 * Kiểm tra lấy giá từ StockX thông qua API chính thức
 */
async function testStockxApi() {
  console.log("=== BẮT ĐẦU KIỂM TRA KẾT NỐI STOCKX API ===");
  const stockx = new StockXAPI();
  
  try {
    // Đăng nhập vào StockX
    console.log("Đang đăng nhập vào StockX...");
    
    const email = process.env.STOCKX_EMAIL || "your_email@example.com";
    const password = process.env.STOCKX_PASSWORD || "your_password";
    
    console.log(`Email đăng nhập: ${email}`);
    
    await stockx.login({
      email: email,
      password: password,
    });
    
    console.log("Đăng nhập thành công!");
    
    // Tìm kiếm sản phẩm
    const searchTerm = process.env.PRODUCT_SEARCH_TERM || "Balenciaga Triple S Black";
    console.log(`Đang tìm kiếm "${searchTerm}"...`);
    
    const products = await stockx.searchProducts(searchTerm);
    if (!products || products.length === 0) {
      console.log("Không tìm thấy sản phẩm");
      return;
    }
    
    console.log(`Tìm thấy ${products.length} sản phẩm:`);
    
    // Hiển thị chi tiết 3 sản phẩm đầu tiên
    for (let i = 0; i < Math.min(3, products.length); i++) {
      const product = products[i];
      console.log(`\n--- Sản phẩm ${i + 1} ---`);
      console.log(`Tên: ${product.name}`);
      console.log(`URL Key: ${product.urlKey}`);
      console.log(`URL: ${product.url}`);
    }
    
    // Chọn sản phẩm đầu tiên
    const product = products[0];
    console.log(`\nLựa chọn sản phẩm: ${product.name}`);
    
    // Lấy chi tiết sản phẩm
    console.log("\nĐang lấy thông tin chi tiết...");
    const marketData = await stockx.fetchProductDetails(product.urlKey);
    
    // Hiển thị thông tin giá
    console.log("\n=== THÔNG TIN GIÁ ===");
    
    if (marketData.market) {
      if (marketData.market.lowestAsk) {
        console.log(`Giá thấp nhất (lowestAsk): $${marketData.market.lowestAsk}`);
      }
      
      if (marketData.market.highestBid) {
        console.log(`Giá cao nhất (highestBid): $${marketData.market.highestBid}`);
      }
      
      if (marketData.market.lastSale) {
        console.log(`Giá bán gần đây nhất (lastSale): $${marketData.market.lastSale}`);
      }
    }
    
    if (marketData.retail && marketData.retail.price) {
      console.log(`Giá bán lẻ (retailPrice): $${marketData.retail.price}`);
    }
    
    // Thông tin chi tiết thêm
    console.log("\n=== THÔNG TIN SẢN PHẨM ===");
    console.log(`Tên: ${marketData.name || 'N/A'}`);
    console.log(`Thương hiệu: ${marketData.brand || 'N/A'}`);
    console.log(`SKU: ${marketData.styleId || 'N/A'}`);
    console.log(`Ngày phát hành: ${marketData.releaseDate || 'N/A'}`);
    
    console.log("\n✅ Kiểm tra StockX API thành công!");
    
  } catch (e) {
    console.error(`\n❌ Lỗi: ${e.message}`);
    if (e.response) {
      console.error("Chi tiết:", e.response.data);
    }
  }
  
  console.log("\n=== KẾT THÚC KIỂM TRA STOCKX API ===");
}

// Chạy function
testStockxApi().catch(console.error); 