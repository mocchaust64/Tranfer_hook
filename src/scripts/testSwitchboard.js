const { Connection, PublicKey } = require("@solana/web3.js");
const { SwitchboardProgram, AggregatorAccount } = require("@switchboard-xyz/solana.js");
require('dotenv').config();

/**
 * Test kết nối với Switchboard và đọc giá từ Aggregator
 */
async function testSwitchboard() {
  console.log("=== BẮT ĐẦU KIỂM TRA KẾT NỐI SWITCHBOARD ===");
  
  try {
    // Kết nối với Solana
    console.log("Đang kết nối với Solana devnet...");
    const connection = new Connection("https://api.devnet.solana.com");
    
    // Tải chương trình Switchboard
    console.log("Đang tải Switchboard program...");
    const switchboardProgram = await SwitchboardProgram.load("devnet", connection);
    
    // Lấy Switchboard Program ID từ .env
    const programId = new PublicKey(process.env.SWITCHBOARD_DEVNET_PROGRAM_ID);
    console.log(`Switchboard Program ID: ${programId.toString()}`);
    
    // Địa chỉ Aggregator
    const aggregatorPubkey = process.env.SWITCHBOARD_AGGREGATOR_PUBKEY;
    if (!aggregatorPubkey || aggregatorPubkey === "YOUR_AGGREGATOR_PUBKEY") {
      console.log("Vui lòng cập nhật SWITCHBOARD_AGGREGATOR_PUBKEY trong file .env");
      return;
    }
    
    console.log(`Đang kiểm tra Aggregator: ${aggregatorPubkey}`);
    
    // Tạo đối tượng Aggregator
    const aggregatorAccount = new AggregatorAccount(switchboardProgram, new PublicKey(aggregatorPubkey));
    
    // Đọc giá hiện tại
    const aggregator = await aggregatorAccount.loadData();
    console.log("Thông tin Aggregator:", {
      name: aggregator.name,
      minConfirmations: aggregator.minConfirmations,
      batchSize: aggregator.batchSize,
      minJobResults: aggregator.minJobResults,
      jobPubkeysSize: aggregator.jobPubkeysData.length,
    });
    
    // Đọc giá hiện tại từ Aggregator
    const latestValue = await aggregatorAccount.getLatestValue();
    console.log(`Giá hiện tại từ Aggregator: $${latestValue}`);
    
    console.log("✅ Kiểm tra Switchboard thành công!");
    
  } catch (e) {
    console.error(`❌ Lỗi: ${e.message}`);
    console.error("Chi tiết lỗi:", e);
  }
  
  console.log("=== KẾT THÚC KIỂM TRA SWITCHBOARD ===");
}

// Chạy function
testSwitchboard().catch(console.error); 