/**
 * Script cập nhật giá điện thoại từ DummyJSON API lên Switchboard On-Demand
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Keypair, Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { OnDemandClient, OnDemandFeedAccount } = require('@switchboard-xyz/on-demand');

// Các hằng số và cấu hình
const SWITCHBOARD_PROGRAM_ID = new PublicKey('Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2');
const FEED_PUBKEY = new PublicKey(process.env.SWITCHBOARD_AGGREGATOR_PUBKEY || 'GMewztoqs2ZPU36qLgB1b3yWVte5XgeDhCkGutxr6ZnW');
const PRODUCT_ID = 'iphone-x'; // ID sản phẩm cần lấy giá
const MOCK_DATA_DIR = path.join(__dirname, '../../mock-data');

// Đảm bảo thư mục lưu trữ dữ liệu mock tồn tại
if (!fs.existsSync(MOCK_DATA_DIR)) {
  fs.mkdirSync(MOCK_DATA_DIR, { recursive: true });
}

/**
 * Lấy giá điện thoại từ DummyJSON API
 */
async function getPhonePrice() {
  try {
    console.log('Đang lấy thông tin giá từ DummyJSON API...');
    
    // Gọi API để lấy thông tin sản phẩm
    const response = await axios.get(`https://dummyjson.com/products/search?q=${PRODUCT_ID}`);
    
    if (!response.data || !response.data.products || response.data.products.length === 0) {
      throw new Error('Không tìm thấy sản phẩm');
    }
    
    // Lấy sản phẩm đầu tiên từ kết quả
    const product = response.data.products[0];
    const price = product.price;
    const discountPercentage = product.discountPercentage;
    const finalPrice = price * (1 - (discountPercentage / 100));
    
    // In thông tin sản phẩm
    console.log(`Tên sản phẩm: ${product.title}`);
    console.log(`Giá gốc: $${price}`);
    console.log(`Giảm giá: ${discountPercentage}%`);
    console.log(`Giá cuối: $${finalPrice.toFixed(2)}`);
    console.log(`Đánh giá: ${product.rating}/5`);
    console.log(`Tồn kho: ${product.stock}`);
    
    return {
      price: finalPrice,
      originalPrice: price,
      discountPercentage,
      product
    };
  } catch (error) {
    console.error('Lỗi khi lấy giá điện thoại:', error.message);
    throw error;
  }
}

/**
 * Cập nhật giá lên Switchboard On-Demand Feed
 */
async function updateOnDemandFeed(price) {
  try {
    console.log('Đang kết nối đến Solana devnet...');
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    
    // Tạo keypair từ khóa riêng tư
    const keypairData = JSON.parse(process.env.WALLET_PRIVATE_KEY || '[]');
    if (!keypairData.length) {
      throw new Error('WALLET_PRIVATE_KEY không hợp lệ trong file .env');
    }
    
    const keypair = Keypair.fromSecretKey(
      Uint8Array.from(keypairData)
    );
    
    console.log(`Địa chỉ ví: ${keypair.publicKey.toString()}`);
    console.log(`Feed Public Key: ${FEED_PUBKEY.toString()}`);
    
    // Tạo client On-Demand
    const onDemandClient = new OnDemandClient({
      program: SWITCHBOARD_PROGRAM_ID,
      connection,
      keypair
    });
    
    // Tạo feed account
    const feedAccount = new OnDemandFeedAccount({
      program: onDemandClient.program,
      publicKey: FEED_PUBKEY
    });
    
    // Kiểm tra trạng thái feed
    const feedState = await feedAccount.loadData();
    console.log(`Feed đã được tìm thấy. Phiên bản: ${feedState.version}`);
    
    // Cập nhật giá trên feed
    console.log(`Đang cập nhật giá: $${price}`);
    
    // Định nghĩa yêu cầu cập nhật với giá mới
    const jobParams = {
      price: price
    };
    
    // Gửi cập nhật đến feed
    const txSignature = await feedAccount.publishUpdate(
      keypair,
      Buffer.from(JSON.stringify(jobParams))
    );
    
    console.log(`Cập nhật thành công! Signature: ${txSignature}`);
    return {
      success: true,
      txSignature
    };
  } catch (error) {
    console.error('Lỗi khi cập nhật giá lên Switchboard:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Lưu dữ liệu mock khi không thể cập nhật lên Switchboard
 */
function saveMockData(price, aggregatorPubkey) {
  try {
    const mockData = {
      price,
      timestamp: new Date().toISOString(),
      aggregatorPubkey: aggregatorPubkey.toString(),
      mock: true
    };
    
    const filePath = path.join(MOCK_DATA_DIR, `phone_price_${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(mockData, null, 2));
    
    console.log(`Đã lưu dữ liệu mock tại: ${filePath}`);
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu dữ liệu mock:', error.message);
    return false;
  }
}

/**
 * Hàm chính thực thi script
 */
async function main() {
  try {
    // Lấy giá từ API
    const { price, product } = await getPhonePrice();
    
    // Cập nhật giá lên Switchboard
    const updateResult = await updateOnDemandFeed(price);
    
    // Nếu cập nhật không thành công, lưu dữ liệu locally
    if (!updateResult.success) {
      console.log('Không thể cập nhật lên Switchboard. Đang lưu dữ liệu cục bộ...');
      saveMockData(price, FEED_PUBKEY);
    }
    
    // In kết quả cuối cùng
    console.log('\n--- KẾT QUẢ ---');
    console.log(`Giá: $${price}`);
    console.log(`Thành công: ${updateResult.success}`);
    console.log('Thông tin sản phẩm:', product.title);
    
    return {
      price,
      success: updateResult.success,
      productInfo: product
    };
  } catch (error) {
    console.error('Lỗi trong quá trình thực thi:', error.message);
    process.exit(1);
  }
}

// Gọi hàm main
main().catch(console.error); 