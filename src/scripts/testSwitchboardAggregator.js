const { Connection, PublicKey } = require("@solana/web3.js");
require("dotenv").config();

async function testAggregator() {
  try {
    console.log("Đang kết nối đến Solana devnet...");
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    
    // Lấy Program ID từ biến môi trường
    const programId = new PublicKey(process.env.SWITCHBOARD_PROGRAM_ID || "Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2");
    console.log(`Switchboard Program ID: ${programId.toString()}`);
    
    const aggregatorPubkey = new PublicKey(process.env.SWITCHBOARD_AGGREGATOR_PUBKEY || "GMewztoqs2ZPU36qLgB1b3yWVte5XgeDhCkGutxr6ZnW");
    console.log(`Aggregator Public Key: ${aggregatorPubkey.toString()}`);
    
    // Kiểm tra thông tin của account để xác nhận nó thuộc Switchboard Program
    const accountInfo = await connection.getAccountInfo(aggregatorPubkey);
    if (!accountInfo) {
      console.error("Không tìm thấy account với địa chỉ này");
      return {
        success: false,
        error: "Không tìm thấy account"
      };
    }
    
    console.log("\nThông tin tài khoản Aggregator:");
    console.log(`- Owner: ${accountInfo.owner.toString()}`);
    console.log(`- Executable: ${accountInfo.executable}`);
    console.log(`- Kích thước dữ liệu: ${accountInfo.data.length} bytes`);
    console.log(`- Lamports: ${accountInfo.lamports} (${accountInfo.lamports / 1e9} SOL)`);
    
    // Kiểm tra xem tài khoản có phải thuộc về Switchboard program đã cấu hình không
    if (accountInfo.owner.equals(programId)) {
      console.log(`\n✅ Aggregator thuộc về Switchboard Program đã cấu hình (${programId.toString()})`);
    } else {
      console.log(`\n❌ Aggregator KHÔNG thuộc về Switchboard Program đã cấu hình!`);
      console.log(`- Owner thực tế: ${accountInfo.owner.toString()}`);
      console.log(`- Program ID đã cấu hình: ${programId.toString()}`);
    }
    
    // Hiển thị 32 byte đầu tiên của dữ liệu để kiểm tra
    const dataPreview = Buffer.from(accountInfo.data).slice(0, 32);
    console.log(`\nDữ liệu (32 byte đầu tiên): ${dataPreview.toString('hex')}`);
    
    return {
      success: true,
      accountInfo: {
        owner: accountInfo.owner.toString(),
        executable: accountInfo.executable,
        dataSize: accountInfo.data.length,
        lamports: accountInfo.lamports,
        ownedByConfiguredProgram: accountInfo.owner.equals(programId)
      }
    };
  } catch (error) {
    console.error("Lỗi khi kiểm tra Aggregator:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

testAggregator().then((result) => {
  console.log("\nKết quả:", result);
}).catch(error => {
  console.error("Có lỗi xảy ra:", error);
});