import { useContext, useEffect, useState } from "react";
import MainLayout from '../layouts/MainLayout';
import { useLocation } from 'react-router-dom';
import { useNavigate, useParams } from "react-router-dom";

import { useRef } from 'react';
import { useAuth } from "../context/AuthContext";
import { ChevronLeft, Loader } from "lucide-react";
import { getFriends } from "../services/FriendService";
import { getAllGroups, joinGroup } from "../services/GroupService";
import { createExpense } from "../services/ExpenseService";
import { CalendarDays } from "lucide-react"; // or use any other icon
import { logEvent } from '../utils/analytics';
import CustomSelect from "../components/CustomSelect";
import CurrencySelect from "../components/CurrencySelect";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "../utils/currencies";
import CategoryModal from "../components/CategoryModal";
import CurrencyModal from "../components/CurrencyModal";

const AddExpense = () => {
    const navigate = useNavigate()
    const [friends, setFriends] = useState([]);
    const { categories, user, userToken, defaultCurrency, preferredCurrencies } = useAuth() || {};
    const location = useLocation();
    const [filteredFriends, setFilteredFriends] = useState([]);
    const [filteredGroups, setFilteredGroups] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [val, setVal] = useState('');
    const [desc, setDesc] = useState('');
    const [category, setCategory] = useState("");
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState("equal"); // equal, value, or percent
    const [selectedFriends, setSelectedFriends] = useState([]);
    const [expenseMode, setExpenseMode] = useState('personal');
    const [showAllGroups, setShowAllGroups] = useState(false);
    const groupDisplayLimit = 4;
    const [currency, setCurrency] = useState();
    const [currencyOptions, setCurrencyOptions] = useState([]);
    const [showCategoryModal, setShowCategoryModal] = useState();
    const [showCurrencyModal, setShowCurrencyModal] = useState();

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
    const isMePresent = selectedFriends.some(f => f._id === 'me');

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
        return totalPaid === amount;
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
        if (!desc || !amount || !category) {
            console.log('Please fill all required fields');
            return;
        }

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
            setAmount('');
            setMode('');
            setCategory('');
            setSelectedFriends([]);
            setGroupSelect(null);
            setExpenseDate(new Date().toISOString().split("T")[0]);
            if (hasPreselectedGroup.current) navigate(`/groups/${groupSelect._id}`)
            if (hasPreselectedFriend.current) navigate(`/friends/${preselectedFriendId.current}`)
        } catch (error) {
            console.error(error);
            console.log('Error creating expense');
        }
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

    const shouldShowSubmitButton = () => {
        if (expenseMode == 'personal') {
            if (desc.length > 0 && amount > 0 && category.length > 0)
                return true
            else return false
        }
        const hasOwing = selectedFriends.some(friend => friend.owing);
        const hasPaying = selectedFriends.some(friend => friend.paying);

        if (!hasOwing || !hasPaying) return false;

        if (mode === "equal") {
            return hasOwing && isPaidAmountValid();
        }

        if (mode === "percent") {
            const totalPercent = selectedFriends
                .filter(friend => friend.owing)
                .reduce((sum, f) => sum + (parseFloat(f.owePercent) || 0), 0);

            return totalPercent === 100 && isPaidAmountValid();
        }

        if (mode === "value") {
            const totalValue = selectedFriends
                .filter(friend => friend.owing)
                .reduce((sum, f) => sum + (f.oweAmount || 0), 0);

            return totalValue === amount && isPaidAmountValid();
        }

        return false;
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


    useEffect(() => {
        friendFilter(val);
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
        setDesc('');
        setAmount('');
        setCategory('');
        setMode('');
        setSelectedFriends([]);
        setGroupSelect(null);
    }, [expenseMode]);


    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">

                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        {hasPreselectedFriend.current && <button onClick={() => navigate(`/friends/${preselectedFriendId?.current}`)}>
                            <ChevronLeft />
                        </button>}
                        {hasPreselectedGroup.current && <button onClick={() => navigate(`/groups/${groupSelect?._id}`)}>
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
                            <p className="text-[13px] text-[#81827C] mb-1">Select a group or a friend you want to add an expense with.</p> :
                            <p className="text-[13px] text-[#81827C] mb-1">To add an expense with multiple people please create a group </p>}</>
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


                            {expenseMode == 'split' && (groupSelect || selectedFriends.length > 0) && <div className="flex flex-wrap gap-2 mt-2">
                                {expenseMode === 'split' && !groupSelect && (
                                    <div key={'selected'}
                                        className="flex w-full flex-col gap-2 mt-2">
                                        <span className="text-[13px] text-teal-500 uppercase">
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
                                        className="flex w-full flex-col gap-2 mt-2">
                                        <span className="text-[13px] text-teal-500 uppercase">
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
                            {expenseMode == 'split' && (selectedFriends.length === 0 || val.length > 0) && (
                                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 mt-4`}>
                                    {(val.length === 0 || selectedFriends.length === 0) && (
                                        <div>
                                            {groups.length > 0 && (
                                                <p className="text-[13px] text-teal-500 uppercase w-full mb-1">GROUPS</p>
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
                                            <p className={`text-[13px] text-teal-500 uppercase mb-1 ${(filteredGroups.length > 0 && selectedFriends.length === 0) && 'mt-4'}`}>
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
                                    <p className="text-[13px] text-teal-500 uppercase mt-2">
                                        Create Expense
                                    </p>
                                    <input
                                        className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3 flex-1"
                                        placeholder="Enter Description"
                                        value={desc}
                                        onChange={(e) => setDesc(e.target.value)}
                                    />
                                    <div className="flex flex-row w-full gap-4">

                                        <div className="flex-1">
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
                                            />
                                        </div>

                                        <input
                                            className="flex-1 text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3"
                                            type="number"
                                            placeholder="Enter Amount"
                                            value={amount}
                                            onChange={(e) => setAmount(parseFloat(e.target.value))}
                                        />
                                    </div>
                                    <div className="flex flex-row w-full gap-4">
                                        <div className="flex-1">
                                            <button
                                                onClick={() => setShowCategoryModal(true)}
                                                className={`w-full ${category ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f] 
               p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                            >
                                                {category || "Select Category"}
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
                                            />
                                        </div>


                                        <div className="flex-1">
                                            <input
                                                type="date"
                                                value={expenseDate}
                                                onChange={(e) => setExpenseDate(e.target.value)}
                                                max={new Date().toISOString().split("T")[0]}
                                                className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1"
                                            />
                                            {/* <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
    <CalendarDays className="h-5 w-5 text-white" />
  </div> */}
                                        </div>

                                    </div>
                                    {expenseMode == 'split' && desc.length > 0 && amount > 0 && category.length > 0 && (
                                        <div className="flex flex-col gap-4">
                                            <p className="text-lg font-medium">Paid by <span className="text-[13px] text-[#81827C] mb-1">(Select the people who paid.)</span></p>

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

                                                            }}
                                                            className={`px-3 py-1 rounded-xl border-2 cursor-pointer transition-all text-sm ${paying ? 'bg-teal-300 text-black border-teal-300' : 'bg-transparent text-[#EBF1D5] border-[#81827C]'
                                                                }`}
                                                        >
                                                            <p className="capitalize">{friend.name}</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* 2. Amount input view for multiple payers */}
                                            {selectedFriends.filter(f => f.paying).length > 1 && (
                                                <div className="w-full flex flex-col gap-2">
                                                    {selectedFriends
                                                        .filter(f => f.paying)
                                                        .map((friend) => (
                                                            <div key={`payAmount-${friend._id}`} className="flex justify-between items-center w-full">
                                                                <p className="capitalize text-[#EBF1D5]">{friend.name}</p>
                                                                <input
                                                                    className="max-w-[100px] text-[#EBF1D5] border-b-2 border-b-[#55554f] p-2 text-base min-h-[40px] pl-3 cursor-pointer text-right"
                                                                    type="number"
                                                                    value={friend.payAmount}
                                                                    onChange={(e) => {
                                                                        const updated = selectedFriends.map(f =>
                                                                            f._id === friend._id ? { ...f, payAmount: parseFloat(e.target.value || 0) } : f
                                                                        );
                                                                        setSelectedFriends(updated);
                                                                    }}
                                                                    placeholder="Amount"
                                                                />
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                            {expenseMode == 'split' && selectedFriends.filter(f => f.paying).length > 1 && !isPaidAmountValid() && <div className="text-[#EBF1D5] text-sm gap-[2px] text-center font-mono w-full flex flex-col justify-center">
                                                <p>{getSymbol('en-IN', currency)} {getPaidAmountInfoTop()} / {getSymbol('en-IN', currency)} {parseFloat(amount).toFixed(2)}</p>
                                                <p className="text-[#a0a0a0]">{getSymbol('en-IN', currency)} {getPaidAmountInfoBottom()} left</p>
                                            </div>}
                                            {expenseMode == 'split' && isPaidAmountValid() && <>
                                                <p className="text-lg font-medium">Owed by  <span className="text-[13px] text-[#81827C] mb-1">(Select the people who owe.)</span></p>


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
                                                {expenseMode == 'split' && selectedFriends.filter(f => f.owing).length > 1 && <div className="flex flex-col gap-4">
                                                    {mode === "" ? (
                                                        <p>Select how to split</p>
                                                    ) : (
                                                        <p>
                                                            Split{" "}
                                                            {mode === "equal"
                                                                ? "Equally"
                                                                : mode === "amount"
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
                    <div className="mt-6 mb-4 text-center text-sm text-[#a0a0a0]">
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
                </div>
            </div>
        </MainLayout>
    );
};

export default AddExpense;

