const express = require('express');
const router = express.Router();
const transferHook = require('../transferHook');

// Endpoint để validate transfer
router.post('/validate', async (req, res) => {
  try {
    const { amount, productId, variant } = req.body;
    
    // Validate các trường bắt buộc
    if (!amount || !productId) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin bắt buộc: amount, productId'
      });
    }
    
    // Validate transfer
    const result = await transferHook.validateTransfer(amount, productId, variant);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    console.error('Lỗi khi validate transfer:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 