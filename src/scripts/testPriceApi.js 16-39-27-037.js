const priceApi = require('../services/priceApi');
const stockxAdapter = require('../services/adapters/stockxAdapter');
const stockxApiAdapter = require('../services/adapters/stockxApiAdapter');
const farfetchAdapter = require('../services/adapters/farfetchAdapter');

/**
 * Kiểm tra lấy giá từ API offchain
 */
async function testPriceApi() {
  try {
    console.log('\n=== KIỂM TRA LẤY GIÁ TỪ API OFFCHAIN ===\n');
    
    // Danh sách sản phẩm cần kiểm tra
    const products = [
      { id: 'balenciaga-triple-s', name: 'Balenciaga Triple S' },
      { id: 'nike-air-force-1', name: 'Nike Air Force 1' },
      { id: 'adidas-yeezy-350', name: 'Adidas Yeezy 350' },
      { id: 'gucci-ace', name: 'Gucci Ace' }
    ];
    
    // Danh sách nguồn dữ liệu
    const sources = ['stockx-api', 'stockx', 'farfetch', 'iprice'];
    
    // Kiểm tra tất cả sản phẩm từ tất cả nguồn
    for (const product of products) {
      console.log(`\n--- SẢN PHẨM: ${product.name} (${product.id}) ---`);
      
      for (const source of sources) {
        try {
          console.log(`\nNguồn dữ liệu: ${source.toUpperCase()}`);
          
          // Kiểm tra xem có sử dụng API thực hay không
          let useRealApi = false;
          
          if (source === 'stockx-api') {
            useRealApi = process.env.USE_STOCKX_API === 'true';
          } else if (source === 'stockx') {
            useRealApi = process.env.USE_REAL_STOCKX_API === 'true';
          } else if (source === 'farfetch') {
            useRealApi = process.env.USE_REAL_FARFETCH_API === 'true';
          }
          
          console.log(`Trạng thái API thực: ${useRealApi ? 'BẬT' : 'TẮT'}`);
          
          // Lấy giá từ API
          console.log('Đang lấy giá...');
          const price = await priceApi.getProductPrice(product.id, source);
          console.log(`Giá từ ${source}: $${price.toFixed(2)}`);
          
          // Nếu đang dùng API thực và nguồn là stockx-api, kiểm tra chi tiết từ adapter
          if (useRealApi) {
            if (source === 'stockx-api') {
              try {
                console.log('Lấy thông tin chi tiết từ StockX API (thư viện)...');
                const details = await stockxApiAdapter.getProductDetails(product.id);
                console.log('Thông tin chi tiết:', JSON.stringify({
                  name: details.name || 'N/A',
                  brand: details.brand || 'N/A',
                  sku: details.styleId || 'N/A',
                  lowestAsk: details.market?.lowestAsk || 'N/A',
                  lastSale: details.market?.lastSale || 'N/A',
                  releaseDate: details.releaseDate || 'N/A'
                }, null, 2));
              } catch (adapterError) {
                console.error('Lỗi khi lấy thông tin chi tiết từ StockX API:', adapterError.message);
              }
            } else if (source === 'stockx') {
              try {
                console.log('Lấy thông tin chi tiết từ StockX API...');
                const details = await stockxAdapter.getProductDetails(product.id);
                console.log('Thông tin chi tiết:', JSON.stringify(details, null, 2));
              } catch (adapterError) {
                console.error('Lỗi khi lấy thông tin chi tiết từ StockX:', adapterError.message);
              }
            } else if (source === 'farfetch') {
              try {
                console.log('Lấy thông tin chi tiết từ Farfetch API...');
                const details = await farfetchAdapter.getProductDetails(product.id);
                console.log('Thông tin chi tiết:', JSON.stringify(details, null, 2));
              } catch (adapterError) {
                console.error('Lỗi khi lấy thông tin chi tiết từ Farfetch:', adapterError.message);
              }
            }
          }
          
        } catch (sourceError) {
          console.error(`Lỗi khi lấy giá từ ${source}:`, sourceError.message);
        }
      }
    }
    
    console.log('\n=== KẾT THÚC KIỂM TRA ===');
    
  } catch (error) {
    console.error('Lỗi khi kiểm tra API:', error);
  }
}

// Chạy kiểm tra
testPriceApi().catch(console.error); 