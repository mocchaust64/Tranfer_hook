# Nghiên Cứu Về Transfer Hook Trên Solana Để Xác Thực Giá Token

## Tổng Quan

Nghiên cứu này tập trung vào việc phát triển một chương trình transfer hook trên Solana để xác thực giá token trong quá trình giao dịch. Mục tiêu là đảm bảo các giao dịch token diễn ra ở mức giá hợp lý, ngăn chặn các giao dịch giả mạo hoặc có giá trị bất thường.

## Tích Hợp Switchboard Oracle

### Cơ Chế Hoạt Động
- Sử dụng Switchboard làm nguồn oracle đáng tin cậy để lấy thông tin giá token
- Thông tin giá được truy xuất và xác thực trong quá trình xử lý transfer hook

### Thay Đổi Mã Nguồn
1. Thêm dependency Switchboard vào Cargo.toml
2. Cập nhật struct PriceValidationState để lưu địa chỉ feed giá
3. Sửa hàm transfer_hook để đọc giá từ oracle và xác thực giao dịch
4. Cập nhật hàm fallback để xử lý các trường hợp đặc biệt

## Thuật Toán So Sánh Giá Sử Dụng Switchboard Oracle

### Quy Trình Xử Lý Giá
1. **Thu Thập Dữ Liệu Giá từ Oracle**
   - Đọc dữ liệu từ Switchboard aggregator sử dụng `AggregatorAccountData::new(price_feed)`
   - Lấy kết quả giá thông qua `feed_data.get_result()`
   - Chuyển đổi định dạng từ `SwitchboardDecimal` sang số nguyên `u64` để dễ xử lý

2. **Tính Toán Giá Đề Xuất**
   - Giá đề xuất được tính dựa trên số lượng token chuyển: `amount / 1_000_000_000`
   - Giả định rằng đơn vị token đã có 9 số thập phân

3. **Xác Định Phạm Vi Giá Chấp Nhận Được**
   - Sử dụng tham số `tolerance_basis_points` để xác định mức chênh lệch giá cho phép
   - Tính phạm vi giá chấp nhận được:
     ```rust
     let deviation_amount = (current_price * tolerance_basis_points) / 10000;
     let min_acceptable_price = current_price.saturating_sub(deviation_amount);
     let max_acceptable_price = current_price.saturating_add(deviation_amount);
     ```

4. **So Sánh và Đưa Ra Quyết Định**
   - Kiểm tra xem giá đề xuất có nằm trong phạm vi chấp nhận được không
   - Nếu nằm trong phạm vi: cho phép giao dịch
   - Nếu nằm ngoài phạm vi: từ chối giao dịch với lỗi `PriceOutOfRange`

### Mã Ví Dụ Cốt Lõi

```rust
// Lấy giá từ Switchboard feed
let feed_data = AggregatorAccountData::new(price_feed)?;
let decimal_result = feed_data.get_result()?;

// Chuyển đổi định dạng
let current_price = decimal_result.mantissa / 10u128.pow(decimal_result.scale as u32);
let current_price = u64::try_from(current_price)?;

// Tính toán giá đề xuất
let proposed_price = amount / 1_000_000_000;

// Xác định phạm vi giá chấp nhận được
let deviation_amount = (current_price * tolerance_basis_points) / 10000;
let min_acceptable_price = current_price.saturating_sub(deviation_amount);
let max_acceptable_price = current_price.saturating_add(deviation_amount);

// So sánh và đưa ra quyết định
if proposed_price >= min_acceptable_price && proposed_price <= max_acceptable_price {
    // Cho phép giao dịch
    Ok(())
} else {
    // Từ chối giao dịch
    Err(PriceValidationError::PriceOutOfRange.into())
}
```

## Yêu Cầu Về API và Quy Trình Tạo Token

### Nguồn Dữ Liệu Cần Thiết
Để hệ thống xác thực giá hoạt động hiệu quả, cần có ít nhất hai nguồn dữ liệu API khác nhau:

1. **API Giá USD của Sản Phẩm/Dịch Vụ**
   - Cung cấp giá thực tế của sản phẩm/dịch vụ bằng USD
   - Nguồn này có thể là hệ thống riêng của ứng dụng hoặc nguồn bên ngoài
   - Ví dụ: API giá vàng, bất động sản, hoặc giá sản phẩm trên nền tảng

2. **API Tỷ Giá Token/UST (hoặc USD)**
   - Lấy từ sàn giao dịch phi tập trung (DEX) nơi token có thanh khoản
   - Cho biết 1 token đổi được bao nhiêu UST/USDC
   - Thường được cung cấp thông qua Switchboard oracle feed

### Công Thức Tính Toán
```
Số token chấp nhận được = (Giá USD của sản phẩm / Tỷ giá token/USD) ± dung sai
```

Ví dụ:
- Sản phẩm có giá: 100 USD (từ API 1)
- Tỷ giá token/USD: 0.5 USD/token (từ API 2 - Switchboard)
- Số token cần chuyển: 100 / 0.5 = 200 token
- Với dung sai 5%: có thể chấp nhận 190-210 token

### Quy Trình Triển Khai Token và Xác Thực Giá

1. **Tạo Token với Transfer Hook**
   - Khởi tạo token trên Solana với extension transfer hook
   - Trong giai đoạn đầu, có thể chưa có cơ chế xác thực giá hoạt động

2. **Tạo Thanh Khoản**
   - Tạo pool thanh khoản cho token/UST trên sàn DEX như Raydium, Orca, hoặc Jupiter
   - Đảm bảo có đủ thanh khoản để tạo tham chiếu giá đáng tin cậy

3. **Thiết Lập Switchboard Feed**
   - Tạo feed Switchboard mới để theo dõi giá token
   - Cấu hình feed để lấy dữ liệu từ API của sàn DEX
   - Đảm bảo feed được cập nhật thường xuyên

4. **Cập Nhật Cấu Hình Transfer Hook**
   - Kết nối địa chỉ feed Switchboard với transfer hook
   - Kích hoạt chức năng xác thực giá

5. **Xử Lý Giai Đoạn Chuyển Tiếp**
   - Thêm cơ chế chuyển đổi từ không xác thực giá sang có xác thực giá
   - Sử dụng cờ hiệu `is_price_validation_active` để điều khiển quá trình này
   - Cung cấp API cập nhật cấu hình để bật/tắt xác thực và điều chỉnh các tham số

### Cải Tiến Có Thể Thực Hiện

1. **Giá Tham Chiếu Ban Đầu**
   - Cho phép thiết lập giá tham chiếu thủ công trong giai đoạn đầu
   - Chuyển đổi sang giá từ oracle khi đã có thanh khoản ổn định

2. **Đa Dạng Hóa Nguồn Giá**
   - Sử dụng nhiều feed Switchboard từ các sàn khác nhau
   - Tính toán giá trung bình hoặc trung vị để tăng độ chính xác

3. **Cơ Chế Quản Trị**
   - Thiết lập các vai trò quản trị có thể điều chỉnh tham số như dung sai giá
   - Cho phép cập nhật feed giá khi cần thiết

## Thách Thức Thiết Kế và Giải Pháp

### Xử Lý Token Mới
**Thách thức:** Làm thế nào để xử lý token mới chưa có sẵn feed giá  
**Giải pháp:** Cho phép linh hoạt trong việc đăng ký nguồn giá khi tạo token mới

### Nguồn Giá Cho Từng Token
**Thách thức:** Cách cho phép mỗi token chỉ định nguồn giá riêng  
**Giải pháp:** Thiết kế hệ thống lưu trữ địa chỉ feed giá trong trạng thái validation của token

### Thiết Kế Linh Hoạt
**Thách thức:** Tránh phải sửa đổi chương trình cho mỗi token mới  
**Giải pháp:** Tạo kiến trúc modular cho phép cấu hình riêng biệt cho mỗi token

## Kiến Trúc Cuối Cùng

### Đặc Điểm Chính
- Mỗi token có feed Switchboard riêng để cung cấp thông tin giá chính xác
- Người tạo token chỉ định feed của họ khi khởi tạo token
- Không cần sửa đổi mã chương trình khi tạo token mới

### Quá Trình Xác Thực
1. Khi một giao dịch chuyển token được khởi tạo, transfer hook được kích hoạt
2. Chương trình truy xuất thông tin giá từ feed Switchboard được chỉ định
3. So sánh giá chuyển token với giá từ oracle
4. Cho phép hoặc từ chối giao dịch dựa trên mức chênh lệch giá

### Trường Hợp Sử Dụng
- Ngăn chặn giao dịch token ở giá không hợp lý
- Bảo vệ người dùng khỏi các giao dịch giả mạo
- Tạo cơ sở hạ tầng cho các ứng dụng DeFi đòi hỏi tính minh bạch về giá

## Kết Luận

Chương trình transfer hook để xác thực giá token trên Solana cung cấp một cơ chế mạnh mẽ để đảm bảo tính minh bạch và công bằng trong giao dịch token. Bằng cách tích hợp với Switchboard oracle, chương trình có thể truy cập dữ liệu giá đáng tin cậy và thực hiện các quyết định xác thực dựa trên dữ liệu thị trường thực tế. 