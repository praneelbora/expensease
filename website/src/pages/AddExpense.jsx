import { useEffect, useState } from "react";
import MainLayout from '../layouts/MainLayout';
import { useLocation } from 'react-router-dom';
import { useRef } from 'react';
import { useAuth } from "../context/AuthContext";
import { Loader } from "lucide-react";
import { getFriends } from "../services/FriendService";
import { getAllGroups, joinGroup } from "../services/GroupService";
import { createExpense } from "../services/ExpenseService";
import expenseCategories from "../assets/categories"


const AddExpense = () => {
    const [friends, setFriends] = useState([]);
    const { userToken } = useAuth() || {}
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
    const visibleGroups = showAllGroups ? filteredGroups : filteredGroups.slice(0, groupDisplayLimit);
    const [showAllFriends, setShowAllFriends] = useState(false);

    const friendDisplayLimit = 4;
    const visibleFriends = showAllFriends ? filteredFriends : filteredFriends.slice(0, friendDisplayLimit);

    const [deleteConfirmMap, setDeleteConfirmMap] = useState({});
    const [groupSelect, setGroupSelect] = useState();
    const hasPreselectedGroup = useRef(false);
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
    }, [groups, location.state]);


    // Remove a friend after confirmation
    const handleRemoveFriend = (friend) => {
        if (deleteConfirmMap[friend._id]) {
            let updatedFriends = selectedFriends.filter(f => f._id !== friend._id);
            const onlyMeLeft = updatedFriends.length === 1 && updatedFriends[0]._id === 'me';
            if (onlyMeLeft || updatedFriends.length === 0) {
                updatedFriends = updatedFriends.filter(f => f._id !== 'me');
            }

            setSelectedFriends(updatedFriends);

            // Reset delete state
            setDeleteConfirmMap(prev => {
                const copy = { ...prev };
                delete copy[friend._id];
                return copy;
            });
        } else {
            setDeleteConfirmMap(prev => ({ ...prev, [friend._id]: true }));
        }
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
            alert('Please fill all required fields');
            return;
        }

        const expenseData = {
            description: desc,
            amount,
            category,
            mode: expenseMode, // 'personal' or 'split'
            splitMode: expenseMode === 'split' ? mode : 'equal', // 'equal' for personal by default
            typeOf: 'expense',
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
            alert('Expense created successfully!');
            setDesc('');
            setAmount('');
            setMode('');
            setCategory('');
            setSelectedFriends([]);
            setGroupSelect(null);
        } catch (error) {
            console.error(error);
            alert('Error creating expense');
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
            return `₹${totalValue.toFixed(2)} / ₹${amount.toFixed(2)}`;
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
            return `₹${remaining.toFixed(2)} left`;
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
            console.error("Add Expense Page - Error loading groups:", error);
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
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <h1 className="text-3xl font-bold capitalize">Add Expense</h1>
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



                    {(expenseMode == 'split' && !groupSelect) && <>{selectedFriends.length == 0? 
                    <p className="text-[13px] text-[#81827C] mb-1">Select a group or a friend you want to add an expense with.</p>:
                    <p className="text-[13px] text-[#81827C] mb-1">To add an expense with multiple people please create a group </p>}</>
                    }
                    {expenseMode == 'split' && !groupSelect && selectedFriends.length == 0 && <input
                        className="w-full bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3"
                        placeholder="Search For Friends / Groups"
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                    />}
                    {loading ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">

                            <Loader />
                        </div>
                    ) : (
                        <div className="flex w-full flex-col">


                            {expenseMode == 'split' && (groupSelect || selectedFriends.length>0) && <div className="flex flex-wrap gap-2 mt-2">
                                {expenseMode == 'split' && !groupSelect && selectedFriends.map((friend) => (
                                    friend._id == 'me' ? <div
                                        key={'selected' + friend._id}
                                        className="flex items-center h-[30px] gap-2 px-3 overflow-hidden rounded-xl border border-[#81827C] text-sm text-[#EBF1D5]"
                                    >
                                        <p className="capitalize">Me</p>

                                    </div> : <div
                                        key={'selected' + friend._id}
                                        className="flex items-center h-[30px] gap-2 ps-3 overflow-hidden rounded-xl border border-[#81827C] text-sm text-[#EBF1D5]"
                                    >
                                        <p className="capitalize">{friend.name}</p>
                                        <button
                                            onClick={() => handleRemoveFriend(friend)}
                                            className={`px-2 h-full -mt-[2px] ${deleteConfirmMap[friend._id] ? 'bg-red-500' : 'bg-transparent'
                                                }`}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                                {expenseMode == 'split' && groupSelect && (<>
                                    <p className="uppercae text-[13px] text-teal-500 w-full mb-1">GROUP SELECTED</p>
                                    <div
                                        key={'selected' + groupSelect._id}
                                        className="flex items-center h-[30px] gap-1 ps-3 overflow-hidden rounded-xl border border-[#81827C] text-sm text-[#EBF1D5]"
                                    >
                                        <p className="capitalize">{groupSelect.name}</p>
                                        <button
                                            onClick={() => handleRemoveGroup(groupSelect)}
                                            className={`px-2 h-full pb-[2px] ${deleteConfirmMap[groupSelect._id] ? 'bg-red-500' : 'bg-transparent'
                                                }`}
                                        >
                                            ×
                                        </button>
                                    </div>
                                </>)}
                            </div>}
                            {expenseMode == 'split' && (selectedFriends.length === 0 || val.length > 0) && (
                                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 px-2 mt-4`}>
                                    {(val.length === 0 || selectedFriends.length === 0) && (
                                        <div>
                                            {groups.length > 0 && (
                                                <p className="text-[13px] text-teal-500 uppercase w-full mb-1">GROUPS</p>
                                            )}

                                            {visibleGroups.map((group) => (
                                                <div
                                                    key={group._id}
                                                    onClick={() => toggleGroupSelection(group)}
                                                    className="flex flex-col gap-1 cursor-pointer hover:bg-[#1f1f1f] py-1 rounded-md transition"
                                                >
                                                    <h2 className="text-xl font-semibold capitalize">{group.name}</h2>
                                                    <hr />
                                                </div>
                                            ))}

                                            {filteredGroups.length > groupDisplayLimit && (
                                                <button
                                                    onClick={() => setShowAllGroups(!showAllGroups)}
                                                    className="text-sm text-blue-400 mt-2 hover:underline"
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

                                        {visibleFriends.map((friend) => (
                                            <div
                                                className="flex flex-col gap-1 mt-1"
                                                onClick={() => toggleFriendSelection(friend)}
                                                key={friend._id}
                                            >
                                                <div className="flex flex-row w-full justify-between items-center">
                                                    <div className="flex flex-col">
                                                        <h2 className="text-xl capitalize text-[#EBF1D5]">{friend.name}</h2>
                                                        <p className="lowercase text-[#81827C]">{friend.email}</p>
                                                    </div>
                                                </div>
                                                <hr />
                                            </div>
                                        ))}

                                        {filteredFriends.length > friendDisplayLimit && (
                                            <button
                                                onClick={() => setShowAllFriends(!showAllFriends)}
                                                className="text-sm text-blue-400 mt-2 hover:underline"
                                            >
                                                {showAllFriends ? 'Show Less' : 'Show More'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}


                            {(expenseMode == 'personal' || (selectedFriends.length > 0 && val === '')) && (
                                <div className="flex flex-col mt-1 gap-2 w-full">
                                    <div className="flex flex-row w-full">
                                        <input
                                            className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3 flex-1"
                                            placeholder="Enter Description"
                                            value={desc}
                                            onChange={(e) => setDesc(e.target.value)}
                                        />
                                    </div>
                                    <input
                                        className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3 flex-1"
                                        type="number"
                                        placeholder="Enter Amount"
                                        value={amount}
                                        onChange={(e) => setAmount(parseInt(e.target.value))}
                                    />
                                    <select
                                        className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3 flex-1"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                    >
                                        <option value="">Select Category</option>
                                        {expenseCategories.map((cat) => (
                                            <option key={cat.name} value={cat.name}>
                                                {cat.emoji} {cat.name}
                                            </option>
                                        ))}

                                    </select>

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
                                                <p>₹{getPaidAmountInfoTop()} / ₹{amount.fix(2)}</p>
                                                <p className="text-[#a0a0a0]">₹{getPaidAmountInfoBottom()} left</p>
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
                                                {expenseMode == 'split' && selectedFriends.filter(f => f.owing).length > 1 && (
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
                        ) :
                            <div className="text-[#EBF1D5] text-sm gap-[2px] text-center font-mono w-full flex flex-col justify-center">
                                <p>{getRemainingTop()}</p>
                                <p className="text-[#a0a0a0]">{getRemainingBottom()}</p>
                            </div>
                        }

                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default AddExpense;

