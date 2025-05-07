/**
 * Route xử lý các yêu cầu liên quan đến giá
 */
const express = require('express');
const axios = require('axios');
const { Connection, PublicKey } = require('@solana/web3.js');
const router = express.Router();

// Các hằng số
const PRODUCT_ID = 1; // ID của iPhone X trên DummyJSON API
const FEED_PUBKEY = new PublicKey(process.env.SWITCHBOARD_AGGREGATOR_PUBKEY || 'GMewztoqs2ZPU36qLgB1b3yWVte5XgeDhCkGutxr6ZnW');

/**
 * @route GET /api/price
 * @desc Lấy giá hiện tại của sản phẩm trực tiếp từ DummyJSON API
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    // Lấy dữ liệu trực tiếp từ API
    const response = await axios.get(`https://dummyjson.com/products/${PRODUCT_ID}`);
    const product = response.data;
    
    return res.json({
      success: true,
      price: product.price,
      currency: 'USD',
      type: 'api',
      source: 'dummyjson-api',
      updatedAt: new Date().toISOString(),
      product: {
        title: product.title,
        description: product.description,
        rating: product.rating,
        discountPercentage: product.discountPercentage
      },
      aggregatorPubkey: FEED_PUBKEY.toString()
    });
  } catch (error) {
    console.error('Lỗi khi lấy thông tin giá:', error);
    return res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi lấy thông tin giá',
      error: error.message
    });
  }
});

/**
 * @route GET /api/price/switchboard
 * @desc Lấy thông tin về Switchboard Feed
 * @access Public
 */
router.get('/switchboard', async (req, res) => {
  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
    
    // Lấy thông tin tài khoản
    const accountInfo = await connection.getAccountInfo(FEED_PUBKEY);
    
    if (!accountInfo) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản Switchboard Feed',
        feedPubkey: FEED_PUBKEY.toString()
      });
    }
    
    return res.json({
      success: true,
      feedPubkey: FEED_PUBKEY.toString(),
      accountInfo: {
        lamports: accountInfo.lamports,
        owner: accountInfo.owner.toString(),
        executable: accountInfo.executable,
        rentEpoch: accountInfo.rentEpoch,
        dataSize: accountInfo.data.length
      }
    });
  } catch (error) {
    console.error('Lỗi khi lấy thông tin Switchboard Feed:', error);
    return res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi lấy thông tin Switchboard Feed',
      error: error.message
    });
  }
});

/**
 * @route POST /api/price/update
 * @desc Cập nhật giá từ DummyJSON API lên Switchboard
 * @access Private
 */
router.post('/update', async (req, res) => {
  try {
    // Chạy script cập nhật giá
    const { execSync } = require('child_process');
    const result = execSync('npm run update:ondemand', { encoding: 'utf8' });
    
    return res.json({
      success: true,
      message: 'Đã cập nhật giá lên Switchboard thành công',
      details: result
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật giá:', error);
    return res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi cập nhật giá',
      error: error.message
    });
  }
});

module.exports = router; 