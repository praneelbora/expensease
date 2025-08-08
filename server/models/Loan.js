const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
    lenderId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    borrowerId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    principal: { 
        type: Number, 
        required: true 
    },
    currency: { 
        type: String, 
        default: 'INR' // In case you want to support multiple currencies
    },
    interestRate: { 
        type: Number, 
        default: 0 // annual % interest, if applicable
    },
    estimatedReturnDate: { 
        type: Date, 
        required: false 
    },
    actualReturnDate: { 
        type: Date 
    },
    description: { 
        type: String, 
        trim: true 
    },
    notes: { 
        type: String, 
        trim: true 
    },
    status: { 
        type: String, 
        enum: ['open', 'partially_repaid', 'closed'], 
        default: 'open' 
    },
    repayments: [{
        amount: { type: Number, required: true },
        at: { type: Date, default: Date.now },
        note: { type: String, trim: true }
    }],
    attachments: [{
        fileUrl: String,
        fileName: String
    }],
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
}, { timestamps: true });

module.exports = mongoose.model('Loan', loanSchema);
