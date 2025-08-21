import { useContext, useEffect, useMemo, useState } from "react";
import MainLayout from '../layouts/MainLayout';
import { useLocation } from 'react-router-dom';
import { useNavigate, useParams } from "react-router-dom";

import { useRef } from 'react';
import { useAuth } from "../context/AuthContext";
import { ChevronLeft, Coins, Loader } from "lucide-react";
import { getFriends } from "../services/FriendService";
import { getAllGroups, joinGroup } from "../services/GroupService";
import { createExpense } from "../services/ExpenseService";
import { fetchFriendsPaymentMethods } from "../services/PaymentMethodService";
import { CalendarDays } from "lucide-react"; // or use any other icon
import { logEvent } from '../utils/analytics';
import CustomSelect from "../components/CustomSelect";
import CurrencySelect from "../components/CurrencySelect";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "../utils/currencies";
import CategoryModal from "../components/CategoryModal";
import CurrencyModal from "../components/CurrencyModal";
import UnifiedPaymentModal from "../components/UnifiedPaymentModal"
const TEST_MODE = import.meta.env.VITE_TEST_MODE
const AddExpense = () => {
    const navigate = useNavigate()
    const [friends, setFriends] = useState([]);
    const { categories, user, userToken, defaultCurrency, preferredCurrencies, paymentMethods, fetchPaymentMethods } = useAuth() || {};
    const location = useLocation();
    const [filteredFriends, setFilteredFriends] = useState([]);
    const [filteredGroups, setFilteredGroups] = useState([]);
    const [friendsPaymentMethods, setFriendsPaymentMethods] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [val, setVal] = useState('');
    const [desc, setDesc] = useState(TEST_MODE ? 'TEST_DESCRIPTION' : "");
    const [category, setCategory] = useState(TEST_MODE ? "TEST_CATEGORY" : "");
    const [amount, setAmount] = useState(TEST_MODE ? "999" : '');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [mode, setMode] = useState("equal"); // equal, value, or percent
    const [selectedFriends, setSelectedFriends] = useState([]);
    const [expenseMode, setExpenseMode] = useState('personal');
    const [showAllGroups, setShowAllGroups] = useState(false);
    const groupDisplayLimit = 4;
    const [currency, setCurrency] = useState();
    const [currencyOptions, setCurrencyOptions] = useState([]);
    const [showCategoryModal, setShowCategoryModal] = useState();
    const [showCurrencyModal, setShowCurrencyModal] = useState();
    const [showPaymentMethodModal, setShowPaymentMethodModal] = useState();

    useEffect(() => {
        setCurrency(defaultCurrency)
    }, [defaultCurrency]);
    useEffect(() => {
        const codes = getAllCurrencyCodes();
        setCurrencyOptions(toCurrencyOptions(codes).sort((a, b) => a.value.localeCompare(b.value)));
    }, []);

    const [expenseDate, setExpenseDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split("T")[0]; // format: YYYY-MM-DD
    });

    const visibleGroups = showAllGroups ? filteredGroups : filteredGroups.slice(0, groupDisplayLimit);
    const [showAllFriends, setShowAllFriends] = useState(false);

    const friendDisplayLimit = 4;
    const visibleFriends = showAllFriends ? filteredFriends : filteredFriends.slice(0, friendDisplayLimit);

    const [deleteConfirmMap, setDeleteConfirmMap] = useState({});
    const [groupSelect, setGroupSelect] = useState();
    const hasPreselectedGroup = useRef(false);
    const hasPreselectedFriend = useRef(false);
    const preselectedFriendId = useRef(false);
    // Checks if "Me" is present
    const isMePresent = selectedFriends?.some(f => f._id === 'me');

    useEffect(() => {
        if (
            !hasPreselectedGroup.current &&
            groups.length > 0 &&
            location.state?.groupId
        ) {
            const preselectedGroup = groups.find(
                g => g._id === location.state.groupId
            );

            if (preselectedGroup) {
                setExpenseMode('split')
                hasPreselectedGroup.current = true; // mark as initialized
                toggleGroupSelection(preselectedGroup);
            }
        }
        if (
            !hasPreselectedFriend.current &&
            friends.length > 0 &&
            location.state?.friendId
        ) {
            const preselectedFriend = friends.find(
                f => f._id === location.state.friendId
            );

            if (preselectedFriend) {
                setExpenseMode('split')
                hasPreselectedFriend.current = true; // mark as initialized
                preselectedFriendId.current = preselectedFriend._id;
                toggleFriendSelection(preselectedFriend);
            }
        }
    }, [groups, friends, location.state]);


    // Remove a friend after confirmation
    const handleRemoveFriend = (friend) => {

        let updatedFriends = selectedFriends.filter(f => f._id !== friend._id);
        const onlyMeLeft = updatedFriends.length === 1 && updatedFriends[0]._id === 'me';
        if (onlyMeLeft || updatedFriends.length === 0) {
            updatedFriends = updatedFriends.filter(f => f._id !== 'me');
        }

        setSelectedFriends(updatedFriends);

    };

    // Remove a friend after confirmation
    const handleRemoveGroup = (group) => {
        if (deleteConfirmMap[group._id]) {
            setDeleteConfirmMap(prev => {
                const copy = { ...prev };
                delete copy[group._id];
                return copy;
            });
            toggleGroupSelection(group)
        } else {
            setDeleteConfirmMap(prev => ({ ...prev, [group._id]: true }));
        }
    };



    const paymentMethodRedirect = () => {
        setShowPaymentMethodModal(false)
        navigate('/account?section=paymentMethod')
    };

    const categoryRedirect = () => {
        setShowCategoryModal(false)
        navigate('/account?section=category')
    };
    const currencyRedirect = () => {
        setShowCurrencyModal(false)
        navigate('/account?section=currency')
    };

    // Re-add "Me" to the list
    const addMe = () => {
        if (!isMePresent) {
            setSelectedFriends(prev => [
                { _id: 'me', name: 'Me', paying: false, owing: false, oweAmount: 0, owePercent: 0 },
                ...prev
            ]);
        }
    };

    const isPaidAmountValid = () => {
        if (expenseMode == 'personal') return true
        const totalPaid = selectedFriends
            .filter(friend => friend.paying)
            .reduce((sum, friend) => sum + (friend.payAmount || 0), 0);
        return parseFloat(totalPaid) === parseFloat(amount);
    };
    useEffect(() => {
        setMode("equal"); // or "" if you want user to reselect
        setSelectedFriends(prevFriends =>
            prevFriends.map(friend => ({
                ...friend,
                paying: false,
                owing: false,
                payAmount: 0,
                oweAmount: 0,
                owePercent: 0
            }))
        );
    }, [amount]);


    const handleSubmitExpense = async () => {
        if (!desc || !amount || !category || !currency) {
            console.log('Please fill all required fields');
            return;
        }
        setLoading(true);
        const expenseData = {
            description: desc,
            amount,
            category,
            mode: expenseMode, // 'personal' or 'split'
            splitMode: expenseMode === 'split' ? mode : 'equal', // 'equal' for personal by default
            typeOf: 'expense',
            date: expenseDate,
            currency
        };
        if (expenseMode === 'personal' && paymentMethod) {
            expenseData.paymentMethodId = paymentMethod;
        }
        if (expenseMode === 'split') {

            expenseData.splits = selectedFriends
                .filter(f => f.owing || f.paying)
                .map(f => ({
                    friendId: f._id,
                    owing: f.owing,
                    paying: f.paying,
                    oweAmount: f.oweAmount,
                    owePercent: f.owePercent,
                    payAmount: f.payAmount,
                    paymentMethodId: f.selectedPaymentMethodId
                }));

            if (groupSelect) {
                expenseData.groupId = groupSelect._id;
            }
        }

        try {
            const data = await createExpense(expenseData, userToken);
            logEvent('expense_added', {
                currency: currency,
                amount: expenseData.amount,
                category: expenseData.category,
            });
            console.log('Expense created successfully!');
            setDesc('');
            setCategory('');
            setAmount('');
            setMode('');
            setSelectedFriends([]);
            setGroupSelect(null);
            setExpenseDate(new Date().toISOString().split("T")[0]);
            if (hasPreselectedGroup.current) navigate(`/groups/${groupSelect._id}`)
            if (hasPreselectedFriend.current) navigate(`/friends/${preselectedFriendId.current}`)
            await fetchPaymentMethods()
        } catch (error) {
            console.error(error);
            console.log('Error creating expense');
        } finally {
            setLoading(false)
        }
    };



    const updateFriendsPaymentMethods = async (list) => {
        const map = await fetchFriendsPaymentMethods(list, userToken); // { [friendId]: PaymentMethod[] }
        // setFriendsPaymentMethods(map);
        // Merge into selectedFriends and auto-pick when there's exactly one option
        setSelectedFriends((prev) =>
            prev.map((f) => {
                const raw = map[f._id == 'me' ? user._id : f._id] || [];
                const methods = raw;
                // keep existing selection if still valid
                let selectedPaymentMethodId = f.selectedPaymentMethodId;
                const stillValid = methods.some((m) => m.paymentMethodId === selectedPaymentMethodId);

                if (!stillValid) {
                    selectedPaymentMethodId =
                        methods.length === 1 ? methods[0].paymentMethodId : null; // auto-pick when only one
                }

                return { ...f, paymentMethods: methods, selectedPaymentMethodId };
            })
        );
    };
    const getPaidAmountInfoTop = () => {
        const totalPaid = selectedFriends
            .filter(friend => friend.paying)
            .reduce((sum, friend) => sum + (friend.payAmount || 0), 0);

        return totalPaid.toFixed(2);
    };

    const getPaidAmountInfoBottom = () => {
        const totalPaid = selectedFriends
            .filter(friend => friend.paying)
            .reduce((sum, friend) => sum + (friend.payAmount || 0), 0);

        const remaining = amount - totalPaid;

        return remaining.toFixed(2);
    };
    const fetchFriends = async () => {
        try {
            const data = await getFriends(userToken);
            if (data.length > 0) {
                setFriends(data);
                friendFilter(''); // call your custom filtering function
            }
        } catch (error) {
            console.error("Error loading friends:", error);
        } finally {
            setLoading(false);
        }
    };



    useEffect(() => {
        fetchFriends();
        fetchGroups();
    }, []);

    const handleOweChange = (friendId, value) => {
        const updated = selectedFriends.map(f =>
            f._id === friendId ? { ...f, oweAmount: parseFloat(value) || 0 } : f
        );
        setSelectedFriends(updated);
    };

    // Update owePercent in percent mode
    const handleOwePercentChange = (friendId, percent) => {
        const updated = selectedFriends.map(f => {
            if (f._id === friendId) {
                const oweAmount = (amount * (parseFloat(percent) / 100)) || 0;
                return { ...f, owePercent: percent, oweAmount };
            }
            return f;
        });
        setSelectedFriends(updated);
    };

    const toggleMode = (newMode) => {
        setMode(newMode);

        let updated = [...selectedFriends];

        if (newMode === "equal") {
            // In Equal mode, distribute the total amount equally
            const owingFriends = updated.filter(f => f.owing);
            const numOwing = owingFriends.length;

            const equalAmount = numOwing > 0 ? Math.floor((amount / numOwing) * 100) / 100 : 0; // floor to 2 decimals
            const totalSoFar = equalAmount * numOwing;
            const leftover = parseFloat((amount - totalSoFar).toFixed(2)); // amount left due to rounding

            let count = 0;

            updated = updated.map((f) => {
                if (!f.owing) return { ...f, oweAmount: 0, owePercent: undefined };

                count++;
                let owe = equalAmount;
                if (count === numOwing) {
                    owe = parseFloat((equalAmount + leftover).toFixed(2)); // last gets the leftover
                }

                return {
                    ...f,
                    oweAmount: owe,
                    owePercent: undefined
                };
            });

            // const payers = updated.filter(f => f.owing);
            // const equalAmount = payers.length > 0 ? parseFloat((amount / payers.length).toFixed(2)) : 0;

            // updated = updated.map(f =>
            //   f.owing ? { ...f, oweAmount: equalAmount, owePercent: undefined } : { ...f, oweAmount: 0, owePercent: undefined }
            // );
        } else if (newMode === "percent") {
            // Reset to 0 oweAmount and use percent values
            updated = updated.map(f => ({
                ...f,
                oweAmount: 0,
                owePercent: f.owePercent || 0
            }));
        } else if (newMode === "value") {
            // In Value mode, reset percent and allow user to manually input the values
            updated = updated.map(f => ({
                ...f,
                oweAmount: 0,
                owePercent: undefined
            }));
        }

        setSelectedFriends(updated);
    };

    const toggleGroupSelection = (group) => {
        const isSelected = group.selected;
        // Deselect group
        if (group._id == groupSelect?._id) {
            const groupMemberIds = group.members.map(m => m._id);
            const updated = selectedFriends.filter(f => !groupMemberIds.includes(f._id));
            setSelectedFriends(updated);
            setGroupSelect()
        } else {
            // Add group members if not already present
            const newMembers = group.members.filter(
                gm => !selectedFriends.some(f => f._id === gm._id)
            ).map(gm => ({
                ...gm,
                paying: false,
                owing: false,
                payAmount: 0,
                oweAmount: 0,
                owePercent: 0
            }));
            setSelectedFriends([...selectedFriends, ...newMembers]);
            updateFriendsPaymentMethods([...selectedFriends, ...newMembers]?.map((f) => f._id), userToken)
            setGroupSelect(group)
        }

        // Toggle group selected state
        const updatedGroups = groups.map(g =>
            g._id === group._id ? { ...g, selected: !isSelected } : g
        );
        setGroups(updatedGroups);
    };

    const friendFilter = (val) => {
        const lowerVal = val.toLowerCase();
        let filtered = friends.map(friend => ({
            ...friend,
            selected: selectedFriends.some(sel => sel._id === friend._id)
        }))
            .filter(friend =>
                friend.name.toLowerCase().includes(lowerVal) ||
                friend.email.toLowerCase().includes(lowerVal)
            );

        // Sort: selected friends at the top
        filtered.sort((a, b) => (b.selected === true) - (a.selected === true));

        setFilteredFriends(filtered);
    };

    const toggleFriendSelection = (friend) => {
        let updatedSelected;

        const isAlreadySelected = selectedFriends.some(sel => sel._id === friend._id);

        if (isAlreadySelected) {
            // Remove from selected
            updatedSelected = selectedFriends.filter(sel => sel._id !== friend._id);
        } else {
            // Add to selected
            updatedSelected = [
                ...selectedFriends,
                {
                    ...friend,
                    paying: false,
                    owing: false,
                    payAmount: 0,
                    oweAmount: 0,
                    owePercent: 0
                }
            ];
        }

        // 👉 Ensure "Me" is at the start if any friend is selected
        const hasFriends = updatedSelected.filter(f => f._id !== 'me').length > 0;
        const isMePresent = updatedSelected.some(f => f._id === 'me');

        if (hasFriends && !isMePresent) {
            updatedSelected = [
                { _id: 'me', name: 'Me', paying: false, owing: false, oweAmount: 0, owePercent: 0 },
                ...updatedSelected
            ];
        }

        setSelectedFriends(updatedSelected);
        updateFriendsPaymentMethods(updatedSelected?.map((f) => f._id), userToken)

        // Update filteredFriends
        const updatedFiltered = friends
            .map(friend => ({
                ...friend,
                selected: updatedSelected.some(sel => sel._id === friend._id),
            }))
            .filter(friend =>
                friend.name.toLowerCase().includes(val.toLowerCase()) ||
                friend.email.toLowerCase().includes(val.toLowerCase())
            );

        updatedFiltered.sort((a, b) => (b.selected === true) - (a.selected === true));
        setFilteredFriends(updatedFiltered);
        setVal('');
    };
    // === Inline guidance (step-by-step coach) ===



    useEffect(() => {
        friendFilter(val);
        groupFilter(val)
    }, [val]);
    const getRemainingTop = () => {
        const owingFriends = selectedFriends.filter(f => f.owing);

        if (mode === 'percent') {
            const totalPercent = owingFriends.reduce((sum, f) => parseFloat(sum) + parseFloat(f.owePercent || 0), 0);
            return `${totalPercent.toFixed(2)} / 100%`;
        }

        if (mode === 'value') {
            const totalValue = owingFriends.reduce((sum, f) => sum + parseFloat(f.oweAmount || 0), 0);
            return `${getSymbol('en-IN', currency)} ${totalValue.toFixed(2)} / ${getSymbol('en-IN', currency)} ${parseFloat(amount).toFixed(2)}`;
        }

        return '';
    };

    const getRemainingBottom = () => {
        const owingFriends = selectedFriends.filter(f => f.owing);

        if (mode === 'percent') {
            const totalPercent = owingFriends.reduce((sum, f) => sum + (parseFloat(f.owePercent) || 0), 0);
            const remaining = 100 - totalPercent;
            return `${remaining.toFixed(2)}% left`;
        }

        if (mode === 'value') {
            const totalValue = owingFriends.reduce((sum, f) => sum + (f.oweAmount || 0), 0);
            const remaining = amount - totalValue;
            return `${getSymbol('en-IN', currency)} ${remaining.toFixed(2)} left`;
        }

        return '';
    };

    const fetchGroups = async () => {
        try {
            const data = await getAllGroups(userToken)
            if (data.length > 0) {
                setGroups(data);
            }

        } catch (error) {
            // console.error("New Expense Page - Error loading groups:", error);
        } finally {
            setLoading(false);
        }
    };
    const groupFilter = (val) => {
        const lowerVal = val.toLowerCase();
        let filtered = groups.map(group => ({
            ...group
        }))
            .filter(group =>
                group.name.toLowerCase().includes(lowerVal)
            );
        setFilteredGroups(filtered);
    };
    useEffect(() => {
        groupFilter('')
    }, [groups])
    useEffect(() => {
        friendFilter('');
    }, [friends]);
    const initialMountComplete = useRef(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            initialMountComplete.current = true;
        }, 2000); // 2 seconds grace period

        return () => clearTimeout(timer); // cleanup on unmount
    }, []);

    useEffect(() => {
        if (!(initialMountComplete.current)) return;

        friendFilter('');
        setDesc(TEST_MODE ? 'TEST_DESCRIPTION' : "");
        setCategory(TEST_MODE ? "TEST_CATEGORY" : "");
        setAmount(TEST_MODE ? "999" : '');
        setMode('');
        setSelectedFriends([]);
        setGroupSelect(null);
    }, [expenseMode]);
    // pretty list: "Alice", "Alice & Bob", "Alice, Bob & Carol"
    const listNames = (arr = []) => {
        const names = arr.map(f => f.name || "Someone");
        if (names.length <= 1) return names.join("");
        if (names.length === 2) return names.join(" & ");
        return `${names.slice(0, -1).join(", ")} & ${names.slice(-1)}`;
    };

    const paidTotals = (friends = []) =>
        friends.filter(f => f.paying).reduce((n, f) => n + (Number(f.payAmount) || 0), 0);

    const owedTotals = (friends = []) =>
        friends.filter(f => f.owing).reduce((n, f) => n + (Number(f.oweAmount) || 0), 0);

    const percentTotals = (friends = []) =>
        friends.filter(f => f.owing).reduce((n, f) => n + (Number(f.owePercent) || 0), 0);

    const money = (ccy, v = 0) => `${getSymbol('en-IN', ccy)} ${Number(v || 0).toFixed(2)}`;


    // state
    const [paymentModal, setPaymentModal] = useState({ open: false, context: 'personal', friendId: null });
    const openPaymentModal = ({ context, friendId = null }) => setPaymentModal({ open: true, context, friendId });
    const closePaymentModal = () => setPaymentModal({ open: false, context: 'personal', friendId: null });

    const pmLabel = (m) => {
        return `${m?.label || m?.type || "Method"}`;
    };
    useEffect(() => {
        if (expenseMode !== 'personal') return;
        if (paymentMethod) return; // don't override user's choice

        const list = Array.isArray(paymentMethods) ? paymentMethods : [];
        if (!list.length) return;

        // priority: default send -> default receive -> single item
        const preferred =
            list.find(pm => pm.isDefaultSend) ||
            list.find(pm => pm.isDefaultReceive) ||
            (list.length === 1 ? list[0] : null);

        if (preferred?._id) setPaymentMethod(preferred._id);
    }, [expenseMode, paymentMethods, paymentMethod]);

    const unifiedOptions = useMemo(() => {
        if (!paymentModal.open) return [];
        if (paymentModal.context === 'personal') {
            // raw docs from Auth — already rich
            return paymentMethods || [];
        }
        // split: friend methods come as { paymentMethodId, ... }
        const f = selectedFriends.find(x => x._id === paymentModal.friendId);
        return (f?.paymentMethods || []).map(m => ({ _id: m.paymentMethodId, ...m }));
    }, [paymentModal, paymentMethods, selectedFriends]);

    const unifiedValue = useMemo(() => {
        if (paymentModal.context === 'personal') return paymentMethod || null;
        const f = selectedFriends.find(x => x._id === paymentModal.friendId);
        return f?.selectedPaymentMethodId ?? null;
    }, [paymentModal, paymentMethod, selectedFriends]);

    const handleSelectUnified = (id) => {
        if (paymentModal.context === 'personal') {
            setPaymentMethod(id);
        } else {
            setSelectedFriends(prev =>
                prev.map(f => f._id === paymentModal.friendId ? { ...f, selectedPaymentMethodId: id } : f)
            );
        }
    };

    // modal props
    const modalOptions = useMemo(() => {
        const f = selectedFriends.find(x => x._id === paymentModal.friendId);
        return (f?.paymentMethods || []).map(m => ({
            value: m.paymentMethodId,
            label: pmLabel(m),
        }));
    }, [paymentModal, selectedFriends]);

    const modalValue = useMemo(() => {
        const f = selectedFriends.find(x => x._id === paymentModal.friendId);
        return f?.selectedPaymentMethodId ?? null;
    }, [paymentModal, selectedFriends]);

    const handleSelectPayment = (paymentMethodId) => {
        setSelectedFriends(prev =>
            prev.map(f =>
                f._id === paymentModal.friendId ? { ...f, selectedPaymentMethodId: paymentMethodId } : f
            )
        );
    };
    // who must pick a PM (among payers)
    const payersNeedingPM = useMemo(() => {
        return (selectedFriends || [])
            .filter(f => f.paying)
            .filter(f => Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1)
            .filter(f => !f.selectedPaymentMethodId);
    }, [selectedFriends]);
    const payersWithPM = useMemo(() => {
        return (selectedFriends || [])
            .filter(f => f.paying)
            .filter(f => Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1)
    }, [selectedFriends]);

    // personal mode: user has >1 methods but none chosen
    const requirePersonalPM = useMemo(() => {
        if (expenseMode !== 'personal') return false;
        const list = Array.isArray(paymentMethods) ? paymentMethods : [];
        return list.length > 1 && !paymentMethod;
    }, [expenseMode, paymentMethods, paymentMethod]);
    const shouldShowSubmitButton = () => {
        if (expenseMode === 'personal') {
            if (!(desc?.length > 0 && Number(amount) > 0 && category?.length > 0)) return false;
            // must pick explicitly if user has >1 methods
            if (requirePersonalPM) return false;
            return true;
        }

        const hasOwing = selectedFriends.some(f => f.owing);
        const hasPaying = selectedFriends.some(f => f.paying);
        if (!hasOwing || !hasPaying) return false;

        // don’t allow proceed if any payer with >1 PM hasn’t picked one
        if (payersNeedingPM.length > 0) return false;

        if (mode === "equal") {
            return hasOwing && isPaidAmountValid();
        }
        if (mode === "percent") {
            const totalPercent = percentTotals(selectedFriends);
            return totalPercent === 100 && isPaidAmountValid();
        }
        if (mode === "value") {
            const totalValue = owedTotals(selectedFriends);
            return totalValue === Number(amount) && isPaidAmountValid();
        }
        return false;
    };
    useEffect(() => {
        // don't auto-override API/server errors you set elsewhere
        if (error) return;

        const amt = Number(amount || 0);
        const sym = getSymbol('en-IN', currency);

        // reset message by default; we’ll set one below
        setMessage("");
        if (expenseMode === 'personal') {

            // 1) Basics for both modes
            if (!desc?.trim()) { setMessage("Add a short description for this expense."); return; }
            if (!currency) { setMessage("Pick a currency."); return; }
            if (!(amt > 0)) { setError(""); setMessage(`Enter an amount greater than 0.`); return; }
            if (!category) { setMessage("Choose a category."); return; }
        }
        else {
            if (!groupSelect && selectedFriends.length <= 1) { setMessage("Select a friend or a group to split with."); return; }
            if (!desc?.trim()) { setMessage("Add a short description for this expense."); return; }
            if (!currency) { setMessage("Pick a currency."); return; }
            if (!(amt > 0)) { setError(""); setMessage(`Enter an amount greater than 0.`); return; }
            if (!category) { setMessage("Choose a category."); return; }
        }

        // 2) Personal mode
        if (expenseMode === 'personal') {
            if (!Array.isArray(paymentMethods) || paymentMethods.length === 0) {
                setMessage("Add a payment account to continue."); return;
            }
            if (requirePersonalPM) {
                setMessage("You have multiple payment accounts. Pick one to proceed."); return;
            }
            setMessage("Looks good! Tap Save Expense.");
            return;
        }

        // 3) Split mode
        const hasAnySelection = groupSelect || selectedFriends.filter(f => f._id !== 'me').length > 0;
        if (!hasAnySelection) { setMessage("Select a friend or a group to split with."); return; }

        const payers = selectedFriends.filter(f => f.paying);
        const oweers = selectedFriends.filter(f => f.owing);
        const paid = paidTotals(selectedFriends);
        const due = Number(amount || 0);

        // Paid-by stage
        if (payers.length === 0) { setMessage("Tap the names of those who paid."); return; }

        if (!isPaidAmountValid()) {
            const remaining = (due - paid).toFixed(2);
            setError(""); // treat as guidance, not a hard error banner
            setMessage(`${money(currency, paid)} / ${money(currency, due)} collected. ${money(currency, remaining)} left.`);
            return;
        }

        // Payers with >1 PM must pick one
        if (payersNeedingPM.length > 0) {
            setMessage(`Select a payment account for: ${listNames(payersNeedingPM)}.`);
            return;
        }

        // Owed-by stage
        if (oweers.length === 0) { setMessage("Now select who owes."); return; }

        // Split rules per mode
        if (mode === "percent") {
            const pct = percentTotals(selectedFriends);
            if (pct !== 100) {
                setError("");
                setMessage(`You’ve assigned ${pct.toFixed(2)}%. Add ${(100 - pct).toFixed(2)}% more.`);
                return;
            }
            setMessage("Great! Percentages add up to 100%. You can Save now.");
            return;
        }

        if (mode === "value") {
            const owe = owedTotals(selectedFriends);
            if (owe !== due) {
                setError("");
                setMessage(`${money(currency, owe)} / ${money(currency, due)} assigned. ${money(currency, due - owe)} left.`);
                return;
            }
            setMessage("All owed amounts add up correctly. You can Save now.");
            return;
        }

        // equal mode (or default)
        setMessage("Looks good! Review the shares and hit Save.");
    }, [
        // deps
        error, message,
        desc, amount, category, currency, expenseMode,
        paymentMethod, paymentMethods, selectedFriends, groupSelect, mode,
        payersNeedingPM.length, requirePersonalPM
    ]);
    if (loading)
        return (
            <MainLayout>
                <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                    <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                        <div className="flex flex-row gap-2">
                            <h1 className="text-3xl font-bold capitalize">New Expense</h1>
                        </div>
                    </div>
                    <div className="flex flex-col flex-1 w-full justify-center items-center">
                        <Loader />
                    </div>
                </div>
            </MainLayout>)
    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">

                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        {hasPreselectedFriend.current && preselectedFriendId?.current != undefined && selectedFriends.length == 2 && preselectedFriendId?.current == selectedFriends[1]._id && <button onClick={() => {
                            if (preselectedFriendId?.current)
                                navigate(`/friends/${preselectedFriendId?.current}`)
                        }}>
                            <ChevronLeft />
                        </button>}
                        {hasPreselectedGroup.current && groupSelect?._id && <button onClick={() => navigate(`/groups/${groupSelect?._id}`)}>
                            <ChevronLeft />
                        </button>}
                        <h1 className="text-3xl font-bold capitalize">New Expense</h1>
                    </div>
                </div>
                <div className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar">

                    <div className="inline-flex border border-[#EBF1D5] rounded-full p-1 mb-2 bg-[#1f1f1f] self-center">

                        <button
                            onClick={() => setExpenseMode('personal')}
                            className={`px-4 py-1.5 rounded-full text-sm transition-all duration-200 font-medium ${expenseMode === 'personal'
                                ? 'bg-[#EBF1D5] text-[#121212]'
                                : 'text-[#EBF1D5] hover:bg-[#2a2a2a]'
                                }`}
                        >
                            Personal Expense
                        </button>
                        <button
                            onClick={() => setExpenseMode('split')}
                            className={`px-4 py-1.5 rounded-full text-sm transition-all duration-200 font-medium ${expenseMode === 'split'
                                ? 'bg-[#EBF1D5] text-[#121212]'
                                : 'text-[#EBF1D5] hover:bg-[#2a2a2a]'
                                }`}
                        >
                            Split Expense
                        </button>
                    </div>


                    {(groups.length > 0 || friends.length > 0) && <>

                        {(expenseMode == 'split' && !groupSelect) && <>{selectedFriends.length == 0 ?
                            <p className="text-[13px] text-[#81827C] mb-1">Select a group or a friend you want to split with.</p> :
                            <></>}</>
                        }
                        {expenseMode == 'split' && !groupSelect && selectedFriends.length == 0 && <input
                            className="w-full bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3"
                            placeholder="Search For Friends / Groups"
                            value={val}
                            onChange={(e) => setVal(e.target.value)}
                        />}
                    </>}
                    {expenseMode === 'split' && friends.length === 0 && groups.length === 0 && (
                        <div className="flex flex-col flex-1 justify-center">
                            <div className="bg-[#1f1f1f] text-center text-[#EBF1D5] border border-[#333] p-4 rounded-lg mt-4">
                                <p className="text-lg font-semibold mb-2">No friends or groups yet!</p>
                                <p className="text-sm text-[#888] mb-4">To split expenses, add a friend or create a group.</p>
                                <div className="flex justify-center gap-4">
                                    <button
                                        onClick={() => window.location.href = '/friends'}
                                        className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition"
                                    >
                                        Add Friend
                                    </button>
                                    <button
                                        onClick={() => window.location.href = '/groups'}
                                        className="bg-[#EBF1D5] text-black px-4 py-2 rounded hover:bg-[#d0d5a9] transition"
                                    >
                                        Create Group
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">

                            <Loader />
                        </div>
                    ) : (
                        <div className="flex w-full flex-col">


                            {expenseMode == 'split' && (groupSelect || selectedFriends.length > 0) && <div className="flex flex-wrap gap-2">
                                {expenseMode === 'split' && !groupSelect && (
                                    <div key={'selected'}
                                        className="flex w-full flex-col gap-2">
                                        <span className="text-[14px] text-teal-500 uppercase mt-2">
                                            Friend Selected
                                        </span>
                                        {selectedFriends
                                            .filter(friend => friend._id !== 'me') // remove "me"
                                            .map(friend => (
                                                <div
                                                    key={'selected' + friend._id}
                                                    className="flex justify-between items-center h-[30px] gap-2 text-xl text-[#EBF1D5]"
                                                >
                                                    <p className="capitalize">{friend.name}</p>
                                                    <button
                                                        onClick={() => handleRemoveFriend(friend)}
                                                        className="px-2 text-sm text-red-500"
                                                        title="Change friend"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                    </div>)
                                }

                                {expenseMode == 'split' && groupSelect && (<>
                                    <div key={'selected' + groupSelect._id}
                                        className="flex w-full flex-col gap-2">
                                        <span className="text-[14px] text-teal-500 uppercase mt-2">
                                            Group Selected
                                        </span>
                                        <div className="flex justify-between items-center h-[30px] gap-2 text-xl text-[#EBF1D5]">
                                            <p className="capitalize">{groupSelect.name}</p>

                                            <button
                                                onClick={() => {
                                                    toggleGroupSelection(groupSelect)
                                                }}
                                                className="px-2 text-sm text-red-500"
                                                title="Change friend"
                                            >
                                                Remove
                                            </button>

                                        </div>

                                    </div>
                                </>)}
                            </div>}
                            {expenseMode == 'split' && (selectedFriends?.length === 0 || val?.length > 0) && (
                                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 mt-4`}>
                                    {(val.length === 0 || selectedFriends?.length === 0) && visibleGroups?.length > 0 && (
                                        <div>
                                            {groups.length > 0 && (
                                                <p className="text-[14px] text-teal-500 uppercase w-full mb-1">GROUPS</p>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                {visibleGroups.map((group) => (
                                                    <button
                                                        key={group._id}
                                                        onClick={() => toggleGroupSelection(group)}
                                                        className={`px-3 py-2 rounded-lg border border-[#333] text-[#EBF1D5]`}
                                                    >
                                                        {group.name}
                                                    </button>))}
                                            </div>
                                            {filteredGroups.length > groupDisplayLimit && (
                                                <button
                                                    onClick={() => setShowAllGroups(!showAllGroups)}
                                                    className="text-sm text-[#a0a0a0] mt-2 hover:underline"
                                                >
                                                    {showAllGroups ? 'Show Less' : 'Show More'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <div>
                                        {filteredFriends.length > 0 && (
                                            <p className={`text-[14px] text-teal-500 uppercase mb-1 ${(filteredGroups.length > 0 && selectedFriends.length === 0) && 'mt-2'}`}>
                                                FRIENDS
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-2">

                                            {visibleFriends.map(fr => (
                                                <button
                                                    key={fr._id}
                                                    onClick={() => toggleFriendSelection(fr)}
                                                    className={`px-3 py-2 rounded-lg border ${selectedFriends.some(s => s._id === fr._id)
                                                        ? 'bg-teal-600 text-white' : 'border-[#333] text-[#EBF1D5]'}`}
                                                >
                                                    {fr.name}
                                                </button>
                                            ))}
                                        </div>

                                        {filteredFriends.length > friendDisplayLimit && (
                                            <button
                                                onClick={() => setShowAllFriends(!showAllFriends)}
                                                className="text-sm text-[#a0a0a0] mt-2 hover:underline"
                                            >
                                                {showAllFriends ? 'Show Less' : 'Show More'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}


                            {(expenseMode == 'personal' || (selectedFriends.length > 0 && val === '')) && (
                                <div className="flex flex-col mt-1 gap-2 w-full">
                                    <p className="text-[14px] text-teal-500 uppercase mt-2">
                                        Create Expense
                                    </p>
                                    <div className="flex flex-row w-full gap-2">

                                        <input
                                            className="flex-2/3 w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3"
                                            placeholder="Description"
                                            value={desc}
                                            onChange={(e) => setDesc(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-row w-full gap-2">

                                        <div className="flex-1/3">
                                            <button
                                                onClick={() => setShowCurrencyModal(true)}
                                                className={`w-full ${currency ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f]  p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                            >
                                                {currency || "Currency"}
                                            </button>
                                            <CurrencyModal
                                                show={showCurrencyModal}
                                                onClose={() => setShowCurrencyModal(false)}
                                                value={currency}
                                                options={currencyOptions}
                                                onSelect={setCurrency}
                                                defaultCurrency={defaultCurrency}
                                                preferredCurrencies={preferredCurrencies}
                                                currencyRedirect={currencyRedirect}
                                            />
                                        </div>

                                        <input
                                            className="flex-2/3 text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3"
                                            type="number"
                                            placeholder="Amount"
                                            value={amount}
                                            onChange={(e) => setAmount(parseFloat(e.target.value))}
                                        />
                                    </div>
                                    <div className="flex flex-row w-full gap-2">
                                        <div className="flex-1/3">
                                            <button
                                                onClick={() => setShowCategoryModal(true)}
                                                className={`w-full ${category ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f]  p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                            >
                                                {category || "Category"}
                                            </button>
                                            <CategoryModal
                                                show={showCategoryModal}
                                                onClose={() => setShowCategoryModal(false)}
                                                value={category}
                                                options={categories.map(cat => ({
                                                    value: cat.name,
                                                    label: `${cat.emoji} ${cat.name}`,
                                                }))}
                                                onSelect={setCategory}
                                                categoryRedirect={categoryRedirect}
                                            />
                                        </div>



                                        <div className="flex-2/3">
                                            <input
                                                type="date"
                                                value={expenseDate}
                                                onChange={(e) => setExpenseDate(e.target.value)}
                                                max={new Date().toISOString().split("T")[0]}
                                                className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1"
                                            />
                                        </div>

                                    </div>
                                    {expenseMode == "personal" && <div className="flex-1/3">
                                        <button
                                            onClick={() => openPaymentModal({ context: 'personal' })}
                                            className={`w-full ${paymentMethod ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f]  p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                        >
                                            {paymentMethod ? paymentMethods?.find(acc => acc._id === paymentMethod)?.label : "Payment Account"}
                                            {/* Split (inside payer rows) */}
                                        </button>
                                    </div>}
                                    {expenseMode == 'split' && desc.length > 0 && amount > 0 && category.length > 0 && (
                                        <div className="flex flex-col gap-2">
                                            <p className="text-[14px] text-teal-500 uppercase mt-2 font-medium">Paid by <span className="text-[13px] text-[#81827C] mb-1">(Select the people who paid.)</span></p>

                                            {/* 1. Selection view */}
                                            <div className="w-full flex flex-wrap gap-2">
                                                {[
                                                    ...selectedFriends
                                                ].map((friend) => {
                                                    const paying = friend.paying || false;

                                                    return (
                                                        <div
                                                            key={`select-${friend._id}`}
                                                            onClick={() => {
                                                                const existingIndex = selectedFriends.findIndex(f => f._id === friend._id);
                                                                let updated = [...selectedFriends];

                                                                if (existingIndex !== -1) {
                                                                    // Toggle paying
                                                                    updated[existingIndex] = {
                                                                        ...updated[existingIndex],
                                                                        paying: !updated[existingIndex].paying
                                                                    };
                                                                }

                                                                // Distribute payAmounts equally
                                                                const payers = updated.filter(f => f.paying);
                                                                const numPayers = payers.length;

                                                                const equalAmount = numPayers > 0 ? Math.floor((amount / numPayers) * 100) / 100 : 0;
                                                                const totalSoFar = equalAmount * numPayers;
                                                                const leftover = parseFloat((amount - totalSoFar).toFixed(2)); // leftover due to rounding

                                                                let count = 0;

                                                                updated = updated.map(f => {
                                                                    if (!f.paying) return { ...f, payAmount: 0 };

                                                                    count++;
                                                                    let pay = equalAmount;
                                                                    if (count === numPayers) {
                                                                        pay = parseFloat((equalAmount + leftover).toFixed(2)); // last one covers the rounding diff
                                                                    }

                                                                    return {
                                                                        ...f,
                                                                        payAmount: pay
                                                                    };
                                                                });

                                                                setSelectedFriends(updated);
                                                                updateFriendsPaymentMethods(updated?.map((f) => f._id), userToken)

                                                            }}
                                                            className={`px-3 py-1 rounded-xl border-2 cursor-pointer transition-all text-sm ${paying ? 'bg-teal-300 text-black border-teal-300' : 'bg-transparent text-[#EBF1D5] border-[#81827C]'
                                                                }`}
                                                        >
                                                            <p className="capitalize">{friend.name}</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>


                                            {(selectedFriends.filter(f => f.paying).length > 1 || payersWithPM.length > 0) && (
                                                <div className="w-full flex flex-col gap-2">
                                                    {selectedFriends
                                                        .filter(f => f.paying)
                                                        .map((friend) => (
                                                            <div key={`payAmount-${friend._id}`} className="flex flex-col gap-2 w-full">
                                                                <div className="flex justify-between items-center w-full">
                                                                    <p className="capitalize text-[#EBF1D5] line-clamp-1">{friend.name}</p>

                                                                    <div className="flex flex-row gap-2 items-end">
                                                                        {/* Only show button when >1 methods; auto-select kept for single method */}
                                                                        {Array.isArray(friend.paymentMethods) && friend.paymentMethods.length > 1 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => openPaymentModal({ context: 'split', friendId: friend._id })}
                                                                                className="bg-transparent border-2 border-[#55554f] text-[#EBF1D5] px-2 py-1 rounded-md hover:border-teal-600 transition line-clamp-1"
                                                                            >
                                                                                {(() => {
                                                                                    const sel = friend.paymentMethods?.find(
                                                                                        m => m.paymentMethodId === friend.selectedPaymentMethodId
                                                                                    );
                                                                                    return sel ? pmLabel(sel) : <Coins />;
                                                                                })()}
                                                                            </button>
                                                                        )}

                                                                        {selectedFriends.filter(f => f.paying).length > 1 && <input
                                                                            className="max-w-[80px] text-[#EBF1D5] border-b-2 border-b-[#55554f] p-2 text-base min-h-[40px] pl-3 cursor-pointer text-right"
                                                                            type="number"
                                                                            value={friend.payAmount}
                                                                            onChange={(e) => {
                                                                                const val = parseFloat(e.target.value || 0);
                                                                                setSelectedFriends((prev) =>
                                                                                    prev.map((f) => (f._id === friend._id ? { ...f, payAmount: val } : f))
                                                                                );
                                                                            }}
                                                                            placeholder="Amount"
                                                                        />}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}


                                            {expenseMode == 'split' && selectedFriends.filter(f => f.paying).length > 1 && !isPaidAmountValid() && <div className="text-[#EBF1D5] text-sm gap-[2px] text-center font-mono w-full flex flex-col justify-center">
                                                <p>{getSymbol('en-IN', currency)} {getPaidAmountInfoTop()} / {getSymbol('en-IN', currency)} {parseFloat(amount).toFixed(2)}</p>
                                                <p className="text-[#a0a0a0]">{getSymbol('en-IN', currency)} {getPaidAmountInfoBottom()} left</p>
                                            </div>}
                                            {expenseMode == 'split' && isPaidAmountValid() && payersNeedingPM.length == 0 && (
                                                <>
                                                    {/* original Owed by block stays exactly the same */}
                                                    <p className="text-[14px] text-teal-500 uppercase mt-2 font-medium">Owed by <span className="text-[13px] text-[#81827C] mb-1">(Select the people who owe.)</span></p>
                                                    {/* <p className="text-lg font-medium">Owed by  <span className="text-[13px] text-[#81827C] mb-1">(Select the people who owe.)</span></p> */}


                                                    {/* 0. Selection view */}
                                                    <div className="w-full flex flex-wrap gap-2">
                                                        {[
                                                            ...selectedFriends
                                                        ].map((friend) => {
                                                            const owing = friend.owing || false;

                                                            return (
                                                                <div
                                                                    key={`select-${friend._id}`}
                                                                    onClick={() => {
                                                                        const existingIndex = selectedFriends.findIndex(f => f._id === friend._id);
                                                                        let updated = [...selectedFriends];

                                                                        if (existingIndex !== -1) {
                                                                            // Toggle owing
                                                                            updated[existingIndex] = {
                                                                                ...updated[existingIndex],
                                                                                owing: !updated[existingIndex].owing
                                                                            };
                                                                        }

                                                                        // Update selected friends and distribute amounts if needed
                                                                        const payers = updated.filter(f => f.owing);
                                                                        if (mode === "equal") {
                                                                            const owingFriends = updated.filter(f => f.owing);
                                                                            const numOwing = owingFriends.length;

                                                                            const equalAmount = numOwing > 0 ? Math.floor((amount / numOwing) * 100) / 100 : 0; // floor to 2 decimals
                                                                            const totalSoFar = equalAmount * numOwing;
                                                                            const leftover = parseFloat((amount - totalSoFar).toFixed(2)); // amount left due to rounding

                                                                            let count = 0;

                                                                            updated = updated.map((f) => {
                                                                                if (!f.owing) return { ...f, oweAmount: 0, owePercent: undefined };

                                                                                count++;
                                                                                let owe = equalAmount;
                                                                                if (count === numOwing) {
                                                                                    owe = parseFloat((equalAmount + leftover).toFixed(2)); // last gets the leftover
                                                                                }

                                                                                return {
                                                                                    ...f,
                                                                                    oweAmount: owe,
                                                                                    owePercent: undefined
                                                                                };
                                                                            });
                                                                        }


                                                                        setSelectedFriends(updated);
                                                                    }}
                                                                    className={`px-3 py-1 rounded-xl border-2 cursor-pointer transition-all text-sm ${owing ? 'bg-teal-300 text-black border-teal-300' : 'bg-transparent text-[#EBF1D5] border-[#81827C]'
                                                                        }`}
                                                                >
                                                                    <p className="capitalize">{friend.name}</p>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    {expenseMode == 'split' && selectedFriends.filter(f => f.owing).length > 1 && <div className="flex flex-col gap-2 text-[14px] text-teal-500 uppercase mt-2">
                                                        {mode === "" ? (
                                                            <p>Select how to split</p>
                                                        ) : (
                                                            <p>
                                                                Split{" "}
                                                                {mode === "equal"
                                                                    ? "Equally"
                                                                    : mode === "value"
                                                                        ? "By Amounts"
                                                                        : "By Percentages"}
                                                            </p>
                                                        )}

                                                        {/* 1. Mode Selection */}
                                                        <div className="flex gap-4">
                                                            <button
                                                                onClick={() => toggleMode("equal")}
                                                                className={`px-4 py-1 text-[11px] rounded-md border border-1 ${mode === "equal" ? "bg-teal-300 text-[#000] border-teal-300 font-bold" : "bg-transparent text-[#EBF1D5]"}`}
                                                            >
                                                                =
                                                            </button>
                                                            <button
                                                                onClick={() => toggleMode("value")}
                                                                className={`px-4 py-1 text-[11px] rounded-md border border-1 ${mode === "value" ? "bg-teal-300 text-[#000] border-teal-300 font-bold" : "bg-transparent text-[#EBF1D5]"}`}
                                                            >
                                                                1.23
                                                            </button>
                                                            <button
                                                                onClick={() => toggleMode("percent")}
                                                                className={`px-4 py-1 text-[11px] rounded-md border border-1 ${mode === "percent" ? "bg-teal-300 text-[#000] border-teal-300 font-bold" : "bg-transparent text-[#EBF1D5]"}`}
                                                            >
                                                                %
                                                            </button>
                                                        </div>
                                                    </div>}

                                                    {/* 2. Amount input view for multiple owe-ers */}
                                                    {expenseMode == 'split' && isPaidAmountValid() && selectedFriends.filter(f => f.owing).length > 1 && (
                                                        <div className="w-full flex flex-col gap-2">
                                                            {selectedFriends
                                                                .filter(f => f.owing)
                                                                .map((friend) => (
                                                                    <div key={`payAmount-${friend._id}`} className="flex justify-between items-center w-full">
                                                                        <p className="capitalize text-[#EBF1D5]">{friend.name}</p>

                                                                        {/* Conditionally render input based on mode */}
                                                                        {mode === "percent" ? (
                                                                            <input
                                                                                className="max-w-[100px] text-[#EBF1D5] border-b-2 border-b-[#55554f] p-2 text-base min-h-[40px] pl-3 cursor-pointer text-right"
                                                                                type="number"
                                                                                value={friend.owePercent || ''}
                                                                                onChange={(e) => handleOwePercentChange(friend._id, e.target.value)}
                                                                                placeholder="Percent"
                                                                            />
                                                                        ) : mode === "value" ? (
                                                                            <input
                                                                                className="max-w-[100px] text-[#EBF1D5] border-b-2 border-b-[#55554f] p-2 text-base min-h-[40px] pl-3 cursor-pointer text-right"
                                                                                type="number"
                                                                                value={friend.oweAmount || ''}
                                                                                onChange={(e) => handleOweChange(friend._id, e.target.value)}
                                                                                placeholder="Amount"
                                                                            />
                                                                        ) : (
                                                                            <p className="text-[#EBF1D5]">{friend.oweAmount || 0}</p>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    )}
                                                    {/* ... keep your existing owed-by UI here unchanged ... */}
                                                </>
                                            )}

                                            {expenseMode == 'split' && isPaidAmountValid() && <>

                                            </>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="w-full flex items-start justify-start align-middle mt-5">
                        {shouldShowSubmitButton() ? (
                            <button
                                type="submit"
                                onClick={() => handleSubmitExpense()}
                                className="w-full py-2 border border-1 bg-teal-300 border-teal-300 rounded text-[#000]"
                            >
                                Save Expense
                            </button>
                        ) : expenseMode == 'split' && isPaidAmountValid() && selectedFriends.filter(f => f.owing).length > 1 ? (
                            <div className="text-[#EBF1D5] text-sm gap-[2px] text-center font-mono w-full flex flex-col justify-center">
                                <p>{getRemainingTop()}</p>
                                <p className="text-[#a0a0a0]">{getRemainingBottom()}</p>
                            </div>
                        ) : <></>
                        }

                    </div>
                </div>

                {expenseMode == 'split' && (!groupSelect && selectedFriends.length > 0) ? <div className="py-2 text-center text-sm text-[#a0a0a0]">
                    Split expense with multiple people?{" "}
                    <button
                        className="text-teal-400 underline"
                        onClick={() => {
                            logEvent('navigate', {
                                screen: 'groups', source: 'cta'
                            });
                            navigate('/groups')
                        }}
                    >
                        Create a group
                    </button>
                </div> :
                    <div className="py-2 text-center text-sm text-[#a0a0a0]">
                        Lent someone money?{" "}
                        <button
                            className="text-teal-400 underline"
                            onClick={() => {
                                logEvent('navigate', {
                                    screen: 'add_expense', source: 'cta'
                                });
                                navigate('/new-loan')
                            }}
                        >
                            Add a Loan
                        </button>
                    </div>
                }
                {message ? <div className="text-sm text-teal-500 bg-teal-900/20 border border-teal-700 rounded px-3 py-2 mb-2 text-center">
                    {message}
                </div> :
                    error && (
                        <div className="text-sm text-red-400 bg-red-900/20 border border-red-700 rounded px-3 py-2 mb-2 text-center">
                            {error}
                        </div>
                    )}
            </div>
            <UnifiedPaymentModal
                show={paymentModal.open}
                onClose={closePaymentModal}
                context={paymentModal.context}                       // 'personal' | 'split'
                privacy={paymentModal.context === 'split' ? 'shared' : 'private'}
                options={unifiedOptions}
                value={unifiedValue}
                onSelect={(id, close) => { handleSelectUnified(id); if (close) closePaymentModal(); }}
                defaultSendId={paymentMethods?.find(a => a.isDefaultSend)?._id}
                defaultReceiveId={paymentMethods?.find(a => a.isDefaultReceive)?._id}
                paymentMethodRedirect={paymentMethodRedirect}
            />
        </MainLayout>
    );
};

export default AddExpense;

