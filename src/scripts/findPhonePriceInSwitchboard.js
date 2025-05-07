/**
 * Script tìm giá điện thoại trong feed Switchboard bằng cách quét mọi offset có thể
 * 
 * Script này sẽ phân tích chi tiết feed Switchboard và tìm giá điện thoại $9.99
 * bằng cách quét từng phần dữ liệu và cố gắng giải mã đúng định dạng.
 */
require('dotenv').config();
const { 
  Connection, 
  PublicKey, 
  clusterApiUrl 
} = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Cấu hình Switchboard
const SWITCHBOARD_AGGREGATOR_PUBKEY = process.env.SWITCHBOARD_AGGREGATOR_PUBKEY || 'GMewztoqs2ZPU36qLgB1b3yWVte5XgeDhCkGutxr6ZnW';
const SWITCHBOARD_ON_DEMAND_PROGRAM_ID = 'Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2';
const TARGET_PRICE = 9.99; // Giá cần tìm
const DECIMAL_PRECISION = 2; // Số chữ số thập phân cần chính xác
const PRICE_TOLERANCE = 0.01; // Dung sai cho phép

// Các offset đã biết cho On-Demand Feeds (dựa trên IDL)
const KNOWN_OFFSETS = [
  { name: 'Discriminator', offset: 0, size: 8 },
  { name: 'Version', offset: 8, size: 1 },
  { name: 'Feed Config', offset: 9, size: 32 },
  { name: 'Target', offset: 41, size: 32 },
  { name: 'Result Ngân hàng', offset: 73, size: 32 },
  { name: 'Transmission', offset: 105, size: 32 },
  // Các offset tiềm năng cho giá trị (từ phân tích trước đó)
  { name: 'Giá trị tiềm năng 1', offset: 2152, size: 8 },
  { name: 'Giá trị tiềm năng 2', offset: 2168, size: 8 },
  { name: 'Giá trị tiềm năng 3', offset: 2176, size: 8 },
  { name: 'Giá trị tiềm năng 4', offset: 2224, size: 8 },
  { name: 'Giá trị tiềm năng 5', offset: 2392, size: 8 },
];

// Hàm xử lý BigInt khi serialize JSON
function replacer(key, value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/**
 * Xuất dữ liệu dưới dạng hex để phân tích
 */
function hexDump(buffer, offset = 0, length = 8) {
  const end = Math.min(offset + length, buffer.length);
  const data = buffer.slice(offset, end);
  const hexView = Buffer.from(data).toString('hex').match(/.{1,2}/g).join(' ');
  return `${hexView}`;
}

/**
 * Lưu kết quả vào file để phân tích
 */
function saveResultToFile(result) {
  try {
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data', { recursive: true });
    }
    
    const filePath = path.join('./data', 'switchboard_analysis.json');
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2, replacer));
    console.log(`✅ Đã lưu kết quả phân tích vào: ${filePath}`);
  } catch (error) {
    console.error(`❌ Lỗi khi lưu kết quả: ${error.message}`);
  }
}

/**
 * Tìm các giá trị tiềm năng trong dữ liệu tài khoản
 */
function findPotentialValues(data) {
  const possibleValues = [];
  const potentialDecimals = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  
  // Quét qua từng offset với bước nhỏ hơn để kiểm tra kỹ hơn
  for (let i = 0; i < data.length - 8; i++) {
    try {
      // Đọc 8 bytes dưới dạng BigInt
      const slice = data.slice(i, i + 8);
      if (slice.length === 8) {
        const valueAsInt64 = Buffer.from(slice).readBigInt64LE();
        
        // Xử lý giá trị BigInt
        if (valueAsInt64 > BigInt(0) && valueAsInt64 < BigInt(1e15)) {
          // Thử với các decimal khác nhau
          for (const decimal of potentialDecimals) {
            const valueWithDecimal = Number(valueAsInt64) / Math.pow(10, decimal);
            
            // Kiểm tra nếu giá trị gần với giá mục tiêu
            if (Math.abs(valueWithDecimal - TARGET_PRICE) < PRICE_TOLERANCE) {
              possibleValues.push({
                offset: i,
                offsetHex: '0x' + i.toString(16).padStart(4, '0'),
                type: 'i64',
                rawValue: valueAsInt64.toString(),
                decimal,
                value: valueWithDecimal,
                diff: Math.abs(valueWithDecimal - TARGET_PRICE),
                hex: hexDump(data, i, 8)
              });
            }
          }
        }
      }
      
      // Thử đọc 8 bytes dưới dạng double
      try {
        const valueAsDouble = Buffer.from(slice).readDoubleLE();
        if (!isNaN(valueAsDouble) && valueAsDouble > 0 && 
            Math.abs(valueAsDouble - TARGET_PRICE) < PRICE_TOLERANCE) {
          possibleValues.push({
            offset: i,
            offsetHex: '0x' + i.toString(16).padStart(4, '0'),
            type: 'f64',
            value: valueAsDouble,
            diff: Math.abs(valueAsDouble - TARGET_PRICE),
            hex: hexDump(data, i, 8)
          });
        }
      } catch (e) {
        // Bỏ qua lỗi
      }
      
      // Thử đọc 4 bytes dưới dạng float
      if (i + 4 <= data.length) {
        try {
          const float32Slice = data.slice(i, i + 4);
          const valueAsFloat = Buffer.from(float32Slice).readFloatLE();
          if (!isNaN(valueAsFloat) && valueAsFloat > 0 && 
              Math.abs(valueAsFloat - TARGET_PRICE) < PRICE_TOLERANCE) {
            possibleValues.push({
              offset: i,
              offsetHex: '0x' + i.toString(16).padStart(4, '0'),
              type: 'f32',
              value: valueAsFloat,
              diff: Math.abs(valueAsFloat - TARGET_PRICE),
              hex: hexDump(data, i, 4)
            });
          }
        } catch (e) {
          // Bỏ qua lỗi
        }
      }
      
      // Thử tìm theo giá trị định dạng cụ thể cho 9.99
      // 9.99 dưới dạng i64 với 2 số thập phân là 999
      if (slice.length >= 4) {
        try {
          const valueAsInt32 = Buffer.from(slice.slice(0, 4)).readInt32LE();
          if (valueAsInt32 === 999) {
            possibleValues.push({
              offset: i,
              offsetHex: '0x' + i.toString(16).padStart(4, '0'),
              type: 'exact match i32',
              rawValue: valueAsInt32.toString(),
              decimal: 2,
              value: valueAsInt32 / 100,
              diff: 0,
              hex: hexDump(data, i, 4)
            });
          }
        } catch (e) {
          // Bỏ qua lỗi
        }
      }
    } catch (e) {
      // Bỏ qua lỗi
    }
  }
  
  return possibleValues;
}

/**
 * Kiểm tra các offset đã biết
 */
function checkKnownOffsets(data) {
  const results = [];
  
  for (const { name, offset, size } of KNOWN_OFFSETS) {
    if (offset + size <= data.length) {
      try {
        let value = null;
        let display = '';
        
        if (size === 8) {
          // Đọc i64
          const slice = data.slice(offset, offset + size);
          const valueAsInt64 = Buffer.from(slice).readBigInt64LE();
          value = valueAsInt64.toString();
          
          // Thử với các decimal khác nhau
          const potentialFormats = [0, 3, 6, 9].map(decimal => {
            const formatted = Number(valueAsInt64) / Math.pow(10, decimal);
            return {
              decimal,
              value: formatted,
              display: formatted.toFixed(decimal)
            };
          });
          
          // Thêm dạng double
          try {
            const valueAsDouble = Buffer.from(slice).readDoubleLE();
            if (!isNaN(valueAsDouble)) {
              potentialFormats.push({
                type: 'f64',
                value: valueAsDouble,
                display: valueAsDouble.toFixed(6)
              });
            }
          } catch (e) {
            // Bỏ qua lỗi
          }
          
          display = potentialFormats.map(f => 
            f.type ? `${f.display} (${f.type})` : `${f.display} (decimal: ${f.decimal})`
          ).join(', ');
        } else {
          // Các trường nhỏ hơn 8 bytes
          const slice = data.slice(offset, offset + size);
          const hex = Buffer.from(slice).toString('hex');
          
          if (size === 1) {
            value = slice[0];
            display = `${value} (0x${hex})`;
          } else if (size === 4) {
            try {
              const int32Value = Buffer.from(slice).readInt32LE();
              const floatValue = Buffer.from(slice).readFloatLE();
              value = { int32: int32Value, float: floatValue };
              display = `int32: ${int32Value}, float: ${floatValue.toFixed(6)}, hex: 0x${hex}`;
            } catch (e) {
              display = `hex: 0x${hex}`;
            }
          } else {
            // Trường dài, hiển thị dạng hex
            value = hex;
            display = `0x${hex}`;
          }
        }
        
        results.push({
          name,
          offset,
          size,
          hex: hexDump(data, offset, size),
          value,
          display
        });
      } catch (e) {
        results.push({
          name, 
          offset,
          size,
          error: e.message
        });
      }
    }
  }
  
  return results;
}

/**
 * Quét chi tiết phần cuối dữ liệu - nơi thường chứa giá trị
 */
function scanLastPortion(data) {
  console.log('\n🔬 Quét chi tiết phần cuối dữ liệu:');
  
  // Bắt đầu từ byte 2000 (thường chứa dữ liệu quan trọng)
  const startOffset = Math.max(data.length - 1000, 0);
  const endOffset = data.length;
  
  for (let i = startOffset; i < endOffset; i += 16) {
    const len = Math.min(16, endOffset - i);
    const slice = data.slice(i, i + len);
    const hexStr = Buffer.from(slice).toString('hex').match(/.{1,2}/g).join(' ');
    
    // Tạo hiển thị ASCII
    let asciiStr = '';
    for (let j = 0; j < slice.length; j++) {
      const byte = slice[j];
      if (byte >= 32 && byte <= 126) {
        asciiStr += String.fromCharCode(byte);
      } else {
        asciiStr += '.';
      }
    }
    
    const offsetHex = '0x' + i.toString(16).padStart(4, '0');
    console.log(`${offsetHex}: ${hexStr.padEnd(48, ' ')} | ${asciiStr}`);
    
    // Thử đọc giá trị tại mỗi vị trí với các định dạng khác nhau
    for (let j = 0; j < len - 3; j++) {
      const subSlice = slice.slice(j, j + 4);
      try {
        const int32Value = Buffer.from(subSlice).readInt32LE();
        // Kiểm tra nếu giá trị có thể là 999 (9.99 với 2 số thập phân)
        if (int32Value === 999) {
          console.log(`  🔍 Tại ${offsetHex + j}: Có thể là 9.99 (int32: ${int32Value})`);
        }
      } catch (e) {
        // Bỏ qua
      }
    }
  }
}

/**
 * Phân tích feed Switchboard và tìm giá điện thoại
 */
async function findPhonePriceInSwitchboard() {
  console.log(`🔍 Đang tìm kiếm giá điện thoại $${TARGET_PRICE} trong feed: ${SWITCHBOARD_AGGREGATOR_PUBKEY}`);
  
  try {
    // Kết nối đến Solana devnet
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    const aggregatorPubkey = new PublicKey(SWITCHBOARD_AGGREGATOR_PUBKEY);
    
    // Lấy thông tin tài khoản
    const accountInfo = await connection.getAccountInfo(aggregatorPubkey);
    
    if (!accountInfo) {
      console.error(`❌ Không tìm thấy tài khoản với pubkey: ${SWITCHBOARD_AGGREGATOR_PUBKEY}`);
      return;
    }
    
    console.log(`✅ Đã tìm thấy tài khoản!`);
    console.log(`🔑 Owner: ${accountInfo.owner.toString()}`);
    console.log(`📊 Kích thước dữ liệu: ${accountInfo.data.length} bytes`);
    
    // Kiểm tra discriminator để xác định loại feed
    const discriminator = Buffer.from(accountInfo.data.slice(0, 8)).toString('hex');
    console.log(`🆔 Discriminator: 0x${discriminator}`);
    
    // Kiểm tra các offset đã biết
    console.log('\n📋 Kiểm tra các offset đã biết:');
    const knownOffsetResults = checkKnownOffsets(accountInfo.data);
    knownOffsetResults.forEach(result => {
      if (result.error) {
        console.log(`- ${result.name} (offset ${result.offset}): Lỗi: ${result.error}`);
      } else {
        console.log(`- ${result.name} (offset ${result.offset}, size ${result.size}): ${result.display}`);
        console.log(`  Hex: ${result.hex}`);
      }
    });
    
    // Quét chi tiết phần cuối dữ liệu
    scanLastPortion(accountInfo.data);
    
    // Tìm các giá trị tiềm năng bằng cách quét toàn bộ dữ liệu
    console.log('\n🔎 Tìm kiếm giá trị gần $9.99:');
    const possibleValues = findPotentialValues(accountInfo.data);
    
    if (possibleValues.length > 0) {
      // Sắp xếp theo độ chính xác (diff từ nhỏ đến lớn)
      possibleValues.sort((a, b) => a.diff - b.diff);
      
      console.log(`✅ Đã tìm thấy ${possibleValues.length} giá trị tiềm năng:`);
      
      possibleValues.forEach((value, index) => {
        let valueInfo = '';
        
        if (value.type === 'f32' || value.type === 'f64') {
          valueInfo = `${value.value.toFixed(DECIMAL_PRECISION)} (${value.type})`;
        } else if (value.type === 'exact match i32') {
          valueInfo = `${value.value.toFixed(DECIMAL_PRECISION)} (CHÍNH XÁC - raw: ${value.rawValue}, decimals: ${value.decimal})`;
        } else {
          valueInfo = `${value.value.toFixed(DECIMAL_PRECISION)} (raw: ${value.rawValue}, decimals: ${value.decimal})`;
        }
        
        console.log(`${index + 1}. Offset ${value.offset} ${value.offsetHex}: ${valueInfo}`);
        console.log(`   Chênh lệch: ${value.diff.toFixed(DECIMAL_PRECISION)}`);
        console.log(`   Hex: ${value.hex}`);
      });
      
      // Hiển thị kết quả tốt nhất
      const bestMatch = possibleValues[0];
      console.log(`\n✨ Kết quả phù hợp nhất: ${bestMatch.value.toFixed(DECIMAL_PRECISION)} tại offset ${bestMatch.offset} (${bestMatch.offsetHex})`);
      
      if (bestMatch.type === 'i64') {
        console.log(`   Dạng số nguyên: ${bestMatch.rawValue}`);
        console.log(`   Số chữ số thập phân: ${bestMatch.decimal}`);
      } else if (bestMatch.type === 'exact match i32') {
        console.log(`   Dạng số nguyên 32-bit: ${bestMatch.rawValue}`);
        console.log(`   Số chữ số thập phân: ${bestMatch.decimal}`);
      } else {
        console.log(`   Kiểu dữ liệu: ${bestMatch.type}`);
      }
      
      console.log(`   Hex: ${bestMatch.hex}`);
      
      // Lưu kết quả vào file
      const result = {
        pubkey: SWITCHBOARD_AGGREGATOR_PUBKEY,
        owner: accountInfo.owner.toString(),
        dataSize: accountInfo.data.length,
        discriminator,
        knownOffsetResults,
        possibleValues,
        bestMatch: {
          offset: bestMatch.offset,
          offsetHex: bestMatch.offsetHex,
          type: bestMatch.type,
          rawValue: bestMatch.rawValue,
          decimal: bestMatch.decimal,
          value: bestMatch.value,
          diff: bestMatch.diff,
          hex: bestMatch.hex
        },
        timestamp: new Date().toISOString()
      };
      
      saveResultToFile(result);
      
      return bestMatch.value;
    } else {
      console.log(`❌ Không tìm thấy giá trị nào gần với $${TARGET_PRICE}`);
      
      // Lưu kết quả phân tích để tham khảo sau
      const result = {
        pubkey: SWITCHBOARD_AGGREGATOR_PUBKEY,
        owner: accountInfo.owner.toString(),
        dataSize: accountInfo.data.length,
        discriminator,
        knownOffsetResults,
        timestamp: new Date().toISOString()
      };
      
      saveResultToFile(result);
      return null;
    }
  } catch (error) {
    console.error(`❌ Lỗi khi tìm giá điện thoại từ Switchboard: ${error.message}`);
    return null;
  }
}

// Chạy script
findPhonePriceInSwitchboard()
  .then(price => {
    if (price !== null) {
      console.log(`\n💰 Giá điện thoại tìm thấy: $${price.toFixed(DECIMAL_PRECISION)}`);
      console.log(`📱 Đọc thành công giá từ feed Switchboard!`);
    } else {
      console.log(`\n⚠️ Không thể tìm thấy giá chính xác trên feed Switchboard.`);
      console.log(`💡 Bạn có thể cần phải cập nhật feed với giá mới hoặc kiểm tra lại cấu trúc dữ liệu.`);
    }
  }); 