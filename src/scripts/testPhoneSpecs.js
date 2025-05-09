const priceApi = require('../services/priceApi');
require('dotenv').config();

/**
 * Chương trình kiểm tra PhoneSpecs Adapter
 * Hiển thị thông tin chi tiết về điện thoại và giá theo từng cấu hình
 */
async function testPhoneSpecs() {
  console.log("\n=== KIỂM TRA THÔNG SỐ KỸ THUẬT ĐIỆN THOẠI ===\n");
  
  try {
    // 1. Lấy danh sách thương hiệu
    console.log("1. DANH SÁCH THƯƠNG HIỆU:");
    const brands = await priceApi.getBrands();
    console.log(brands);
    console.log("-----------------------------\n");
    
    // 2. Lấy danh sách mẫu của từng thương hiệu
    for (const brand of brands) {
      console.log(`2. DANH SÁCH MẪU CỦA THƯƠNG HIỆU ${brand.toUpperCase()}:`);
      const models = await priceApi.getModelsByBrand(brand);
      console.table(models);
      console.log("-----------------------------\n");
    }
    
    // 3. Tìm kiếm sản phẩm theo từ khóa
    const searchTerms = ['iPhone', 'Samsung', 'Pixel', 'Pro'];
    for (const term of searchTerms) {
      console.log(`3. TÌM KIẾM VỚI TỪ KHÓA "${term}":`);
      const results = await priceApi.searchProducts(term);
      console.table(results);
      console.log("-----------------------------\n");
    }
    
    // 4. Lấy thông tin chi tiết của một số mẫu điện thoại
    const phoneModels = [
      'iphone-15-pro-max',
      'samsung-galaxy-s24-ultra',
      'google-pixel-8-pro',
      'xiaomi-14-ultra'
    ];
    
    for (const model of phoneModels) {
      console.log(`4. THÔNG TIN CHI TIẾT CỦA ${model.toUpperCase()}:`);
      const details = await priceApi.getProductDetails(model);
      
      // Hiển thị thông tin cơ bản
      console.log(`- Tên: ${details.baseInfo.name}`);
      console.log(`- Thương hiệu: ${details.brand}`);
      console.log(`- Ngày phát hành: ${details.baseInfo.releaseDate}`);
      console.log(`- Kích thước: ${details.baseInfo.dimensions}`);
      console.log(`- Trọng lượng: ${details.baseInfo.weight}`);
      console.log(`- Hệ điều hành: ${details.baseInfo.operatingSystem}`);
      
      // Hiển thị thông tin màn hình
      console.log(`\nMàn hình:`);
      console.log(`- Loại: ${details.display.type}`);
      console.log(`- Kích thước: ${details.display.size}`);
      console.log(`- Độ phân giải: ${details.display.resolution}`);
      console.log(`- Tần số quét: ${details.display.refreshRate}`);
      
      // Hiển thị thông tin CPU
      console.log(`\nBộ xử lý:`);
      console.log(`- Chipset: ${details.processor.chipset}`);
      console.log(`- CPU: ${details.processor.cpu}`);
      console.log(`- GPU: ${details.processor.gpu}`);
      
      // Hiển thị thông tin camera
      console.log(`\nCamera chính:`);
      details.camera.main.forEach((cam, index) => {
        console.log(`  ${index + 1}. ${cam.type}: ${cam.resolution}, ${cam.aperture}`);
      });
      console.log(`Camera selfie: ${details.camera.selfie.resolution}, ${details.camera.selfie.aperture}`);
      
      // Hiển thị thông tin pin
      console.log(`\nPin:`);
      console.log(`- Dung lượng: ${details.battery.capacity}`);
      console.log(`- Sạc: ${details.battery.charging.join(', ')}`);
      
      // Hiển thị các phiên bản và giá
      console.log(`\nCác phiên bản và giá:`);
      for (const variant of details.memory.variants) {
        console.log(`- RAM ${variant.ram}, Bộ nhớ ${variant.storage}: $${variant.price}`);
        
        // Lấy giá theo cấu hình
        const variantConfig = `ram=${variant.ram},storage=${variant.storage}`;
        const price = await priceApi.getProductPrice(model, 'phonespecs', variantConfig);
        console.log(`  Giá hiện tại: $${price.toFixed(2)}`);
      }
      
      console.log("-----------------------------\n");
    }
    
    // 5. So sánh chi tiết giữa các mẫu cùng dòng
    console.log("5. SO SÁNH GIỮA CÁC MẪU IPHONE 15:");
    const iphoneModels = ['iphone-15', 'iphone-15-pro', 'iphone-15-pro-max'];
    const comparisonData = [];
    
    for (const model of iphoneModels) {
      const details = await priceApi.getProductDetails(model);
      const basePrice = details.memory.variants[0].price;
      
      comparisonData.push({
        'Tên': details.baseInfo.name,
        'Màn hình': details.display.size,
        'Tần số quét': details.display.refreshRate,
        'Chipset': details.processor.chipset,
        'RAM': details.memory.variants[0].ram,
        'Camera chính': details.camera.main[0].resolution,
        'Pin': details.battery.capacity,
        'Giá khởi điểm': `$${basePrice}`
      });
    }
    
    console.table(comparisonData);
    console.log("-----------------------------\n");
    
    console.log("=== KẾT THÚC KIỂM TRA ===");
  } catch (error) {
    console.error("Lỗi khi kiểm tra:", error);
  }
}

// Chạy chương trình
testPhoneSpecs().catch(console.error); 