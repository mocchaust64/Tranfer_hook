const { Connection, PublicKey } = require('@solana/web3.js');
const { SwitchboardProgram, AggregatorAccount } = require('@switchboard-xyz/solana.js');
require('dotenv').config();

async function testSwitchboardV2() {
  try {
    console.log("===== BẮT ĐẦU KIỂM TRA SWITCHBOARD V2 =====");
    
    // Kết nối đến Solana devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    console.log("Đã kết nối tới Solana devnet");
    
    // Switchboard V2 Program ID chính thức
    const switchboardV2ProgramId = new PublicKey('SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f');
    console.log(`Program ID Switchboard V2: ${switchboardV2ProgramId.toString()}`);
    
    // Switchboard On-Demand Program ID
    const switchboardOnDemandId = new PublicKey('Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2');
    console.log(`Program ID Switchboard On-Demand: ${switchboardOnDemandId.toString()}`);
    
    // Lấy Aggregator của chúng ta từ .env
    const ourAggregatorPubkey = new PublicKey(process.env.SWITCHBOARD_AGGREGATOR_PUBKEY);
    console.log(`\nAggregator của chúng ta: ${ourAggregatorPubkey.toString()}`);
    
    // Kiểm tra thông tin Aggregator của chúng ta
    const accountInfo = await connection.getAccountInfo(ourAggregatorPubkey);
    if (!accountInfo) {
      console.log("❌ Không tìm thấy account Aggregator");
    } else {
      console.log(`✅ Tìm thấy account Aggregator!`);
      console.log(`Owner: ${accountInfo.owner.toString()}`);
      
      if (accountInfo.owner.equals(switchboardV2ProgramId)) {
        console.log("✅ Aggregator thuộc về Switchboard V2");
      } else if (accountInfo.owner.equals(switchboardOnDemandId)) {
        console.log("✅ Aggregator thuộc về Switchboard On-Demand");
      } else {
        console.log("❌ Aggregator không thuộc về Switchboard");
      }
      
      console.log(`Kích thước dữ liệu: ${accountInfo.data.length} bytes`);
    }
    
    // Thử tìm các feed phổ biến trên devnet
    console.log("\n=== TÌM KIẾM FEED SWITCHBOARD V2 TRÊN DEVNET ===");
    
    // Một số feed phổ biến trên devnet
    const knownFeeds = [
      // SOL/USD feed
      new PublicKey('GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR'),
      // BTC/USD feed
      new PublicKey('8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee'),
      // ETH/USD feed
      new PublicKey('HNStfhaLnqwF2ZtJUizaA9uHDAVB976r2AgTUx9LrdEo')
    ];
    
    for (const feedPubkey of knownFeeds) {
      console.log(`\nKiểm tra feed: ${feedPubkey.toString()}`);
      const feedInfo = await connection.getAccountInfo(feedPubkey);
      
      if (!feedInfo) {
        console.log(`❌ Feed không tồn tại trên devnet`);
        continue;
      }
      
      console.log(`✅ Tìm thấy feed!`);
      console.log(`Owner: ${feedInfo.owner.toString()}`);
      
      if (feedInfo.owner.equals(switchboardV2ProgramId)) {
        console.log("✅ Feed thuộc về Switchboard V2");
        
        try {
          // Thử tải Switchboard Program
          console.log("\nĐang tải Switchboard Program...");
          const program = await SwitchboardProgram.load('devnet', connection);
          console.log(`✅ Đã tải Program thành công, ID: ${program.programId.toString()}`);
          
          // Thử đọc feed
          console.log("\nĐang đọc giá trị từ feed...");
          const aggregatorAccount = new AggregatorAccount({
            program,
            publicKey: feedPubkey
          });
          
          // Thử lấy dữ liệu
          console.log("Đang tải dữ liệu feed...");
          try {
            const feedData = await aggregatorAccount.loadData();
            console.log(`✅ Đã tải dữ liệu feed!`);
            console.log(`- Quyền: ${feedData.authority.toString()}`);
            console.log(`- Queue: ${feedData.queuePubkey.toString()}`);
            console.log(`- Min Oracle Results: ${feedData.minOracleResults}`);
            console.log(`- Min Job Results: ${feedData.minJobResults}`);
          } catch (dataError) {
            console.log(`❌ Lỗi khi tải dữ liệu feed: ${dataError.message}`);
          }
          
          // Thử lấy giá trị mới nhất
          console.log("\nĐang đọc giá trị mới nhất...");
          try {
            const latestValue = await aggregatorAccount.getLatestValue();
            console.log(`✅ Giá trị mới nhất: ${latestValue}`);
            
            // Switchboard V2 hoạt động tốt, có thể sử dụng được
            console.log("\n=== KẾT LUẬN ===");
            console.log("✅ Switchboard V2 HOẠT ĐỘNG TỐT!");
            console.log("✅ Có thể tích hợp với Transfer Hook!");
            console.log("Feed có thể dùng làm mẫu: " + feedPubkey.toString());
            
            return {
              success: true,
              message: "Switchboard V2 hoạt động tốt",
              workingFeed: feedPubkey.toString(),
              value: latestValue
            };
          } catch (valueError) {
            console.log(`❌ Lỗi khi đọc giá trị mới nhất: ${valueError.message}`);
          }
        } catch (error) {
          console.error(`❌ Lỗi khi tải Switchboard Program: ${error.message}`);
        }
      } else if (feedInfo.owner.equals(switchboardOnDemandId)) {
        console.log("⚠️ Feed thuộc về Switchboard On-Demand (không phải V2)");
      } else {
        console.log("❓ Feed thuộc về một program khác");
      }
    }
    
    console.log("\n=== KẾT LUẬN ===");
    console.log("⚠️ Không tìm thấy feed Switchboard V2 nào hoạt động!");
    console.log("⚠️ Cần tạo feed mới hoặc dùng Switchboard On-Demand!");
    
    return {
      success: false,
      message: "Không tìm thấy feed Switchboard V2 nào hoạt động"
    };
    
  } catch (error) {
    console.error("❌ Lỗi khi kiểm tra Switchboard V2:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Chạy kiểm tra
testSwitchboardV2().then(result => {
  console.log("\nKết quả:", result);
}).catch(error => {
  console.error("❌ Lỗi không xử lý được:", error);
}); 