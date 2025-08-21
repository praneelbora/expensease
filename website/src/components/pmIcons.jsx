// src/components/pmIcons.js
import {
    CreditCard, Wallet, Landmark, Banknote, Coins, PiggyBank,
    Smartphone, Building2, Send, IndianRupee, Sparkles
} from 'lucide-react';

// concrete icons user can pick
export const PM_ICON_COMPONENTS = {
    'credit-card': CreditCard,
    'wallet': Wallet,
    'landmark': Landmark,
    'banknote': Banknote,
    'coins': Coins,
    'piggy-bank': PiggyBank,
    'smartphone': Smartphone,
    'building-2': Building2,
    'send': Send,
    'indian-rupee': IndianRupee,
};

// sensible defaults when iconKey is 'auto'
export const PM_DEFAULT_ICON_BY_TYPE = {
    upi: Smartphone,
    bank: Landmark,
    card: CreditCard,
    cash: Banknote,
    wallet: Wallet,
    other: Coins,
};

// helper to resolve which icon to render
export function getPMIcon({ iconKey, type }) {
    if (iconKey && iconKey !== 'auto' && PM_ICON_COMPONENTS[iconKey]) {
        return PM_ICON_COMPONENTS[iconKey];
    }
    return PM_DEFAULT_ICON_BY_TYPE[type] || Wallet;
}

// choices shown in the picker (include “Auto” pseudo-option)
export const PM_ICON_CHOICES = [
    { key: 'auto', label: 'Auto', Icon: Sparkles }, // shows “auto” choice
    { key: 'credit-card', label: 'Card', Icon: CreditCard },
    { key: 'wallet', label: 'Wallet', Icon: Wallet },
    { key: 'landmark', label: 'Bank', Icon: Landmark },
    { key: 'banknote', label: 'Cash', Icon: Banknote },
    { key: 'coins', label: 'Coins', Icon: Coins },
    { key: 'piggy-bank', label: 'Savings', Icon: PiggyBank },
    { key: 'smartphone', label: 'UPI', Icon: Smartphone },
    { key: 'building-2', label: 'Business', Icon: Building2 },
    { key: 'send', label: 'Send', Icon: Send },
    { key: 'indian-rupee', label: '₹', Icon: IndianRupee },
];
