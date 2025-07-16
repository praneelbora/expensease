import { useEffect, useState } from "react";
import MainLayout from '../layouts/MainLayout';
import Cookies from 'js-cookie'

const AddExpense = () => {
    const [friends, setFriends] = useState([]);
    const [filteredFriends, setFilteredFriends] = useState([]);
    const [filteredGroups, setFilteredGroups] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [val, setVal] = useState('');
    const [desc, setDesc] = useState('');
    const [amount, setAmount] = useState();
    const [mode, setMode] = useState("equal"); // equal, value, or percent
    const [selectedFriends, setSelectedFriends] = useState([]);

    const [deleteConfirmMap, setDeleteConfirmMap] = useState({});
    const [groupSelect, setGroupSelect] = useState();

    // Checks if "Me" is present
    const isMePresent = selectedFriends.some(f => f._id === 'me');

    // Remove a friend after confirmation
    const handleRemoveFriend = (friend) => {
        if (deleteConfirmMap[friend._id]) {
            const updatedFriends = selectedFriends.filter(f => f._id !== friend._id);
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
        const totalPaid = selectedFriends
            .filter(friend => friend.paying)
            .reduce((sum, friend) => sum + (friend.payAmount || 0), 0);

        return totalPaid === amount;
    };

    const handleSubmitExpense = async () => {
        const expenseData = {
            description: desc,
            amount,
            splitMode: mode,
            splits: selectedFriends.map(f => ({
                friendId: f._id,
                owing: f.owing,
                paying: f.paying,
                oweAmount: f.oweAmount,
                owePercent: f.owePercent,
                payAmount: f.payAmount
            }))
        };

        if (groupSelect) {
            expenseData.groupId = groupSelect._id; // Assuming groupSelect is an object with `_id`
        }

        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-token': Cookies.get('userToken')
                },
                body: JSON.stringify(expenseData)
            });

            if (!response.ok) throw new Error('Failed to save expense');
            const data = await response.json();
            alert('Expense created successfully!');

            // Reset all form states
            setDesc('');
            setAmount(0);
            setMode('');
            setSelectedFriends([]);
            setGroupSelect(null); // Optional: reset group if desired

            // Navigate or update UI here
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
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/friends/`, {
                headers: {
                    "Content-Type": "application/json",
                    'x-auth-token': Cookies.get('userToken'),
                },
            });

            if (!response.ok) {
                throw new Error("Failed to fetch friends");
            } else {
                const data = await response.json();
                if (data.length > 0) {
                    setFriends(data);
                    friendFilter('');
                }
            }
        } catch (error) {
            console.error("Error loading friends:", error);
        } finally {
            setLoading(false);
        }
    };

    const shouldShowSubmitButton = () => {
        const hasOwing = selectedFriends.some(friend => friend.owing);
        const hasPaying = selectedFriends.some(friend => friend.paying);

        if (!hasOwing || !hasPaying) return false;

        if (mode === "equal") {
            return hasOwing && isPaidAmountValid();
        }

        if (mode === "percent") {
            const totalPercent = selectedFriends
                .filter(friend => friend.owing)
                .reduce((sum, f) => sum + (f.owePercent || 0), 0);

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
        console.log(group);

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
            // Add to selected with paying and payAmount default values
            updatedSelected = [
                ...selectedFriends,
                {
                    ...friend,
                    paying: false,    // default: paying
                    owing: false,
                    payAmount: 0,        // default: 0
                    oweAmount: 0,
                    owePercent: 0
                }
            ];
        }

        setSelectedFriends(updatedSelected);

        // Reflect selection state in filtered list
        const updatedFiltered = filteredFriends.map(f => ({
            ...f,
            selected: updatedSelected.some(sel => sel._id === f._id),
        }));

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
            const totalPercent = owingFriends.reduce((sum, f) => sum + (f.owePercent || 0), 0);
            return `${totalPercent.toFixed(2)} / 100%`;
        }

        if (mode === 'value') {
            const totalValue = owingFriends.reduce((sum, f) => sum + (f.oweAmount || 0), 0);
            return `₹${totalValue.toFixed(2)} / ₹${amount.toFixed(2)}`;
        }

        return '';
    };

    const getRemainingBottom = () => {
        const owingFriends = selectedFriends.filter(f => f.owing);

        if (mode === 'percent') {
            const totalPercent = owingFriends.reduce((sum, f) => sum + (f.owePercent || 0), 0);
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
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/groups/`, {
                headers: {
                    "Content-Type": "application/json",
                    'x-auth-token': Cookies.get('userToken'),
                },
            });

            if (!response.ok) {
                throw new Error("Failed to fetch groups");
            }
            else {
                const data = await response.json();
                if (data.length > 0) {
                    console.log(data);
                    setGroups(data);
                }
            }

        } catch (error) {
            console.error("Error loading groups:", error);
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

    return (
        <MainLayout>
            <div className="max-h-screen bg-[#121212] text-[#EBF1D5] overflow-hidden">
                <div className="flex flex-row justify-between">
                    <h1 className="text-3xl font-bold mb-6">Add Expense</h1>
                </div>
                {!groupSelect && <input
                    className="w-full bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3 flex-1"
                    placeholder="Search For Friends / Groups"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                />}
                {loading ? (
                    <p>Loading friends...</p>
                ) : filteredFriends.length === 0 ? (
                    <p>No friends found.</p>
                ) : (
                    <div className="flex w-full flex-col">
                        {(selectedFriends.length === 0 || val.length > 0) && (
                            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-2 mt-4`}>
                                <div>
                                    {groups.length > 0 && <p className="uppercae text-[14px] text-[#EBF1D5] w-full mb-1">GROUPS</p>}
                                    {filteredGroups.map((group) => (
                                        <div className="flex flex-col gap-2" key={group._id}>
                                            <div
                                                className={`flex flex-row w-full justify-between items-center cursor-pointer`}
                                                onClick={() => toggleGroupSelection(group)}
                                            >
                                                <div className="flex flex-col">
                                                    <h2 className="text-xl capitalize text-[#EBF1D5] flex flex-row items-center gap-2">
                                                        {group.name}
                                                    </h2>
                                                </div>
                                            </div>
                                            <hr />
                                        </div>
                                    ))}


                                </div>
                                <div>
                                    {/* {filteredFriends.length>0 && <p className="uppercae text-[14px] text-[#EBF1D5] mb-1">FRIENDS</p>}
                {filteredFriends.map((friend) => (
                  <div className="flex flex-col gap-2" onClick={() => toggleFriendSelection(friend)} key={friend._id}>
                    <div className="flex flex-row w-full justify-between items-center">
                      <div className="flex flex-col">
                        <h2 className="text-xl capitalize text-[#EBF1D5]">{friend.name}</h2>
                        <p className="lowercase text-[#81827C]">{friend.email}</p>
                      </div>
                    </div>
                    <hr />
                  </div>
                ))} */}
                                </div>
                            </div>
                        )}
                        <div className="flex flex-wrap my-4 gap-2">
                            {/* {!groupSelect && selectedFriends.map((friend) => (
                  <div
                    key={'selected' + friend._id}
                    className="flex w-min items-center h-[30px] gap-2 ps-3 overflow-hidden rounded-xl border border-[#81827C] text-sm text-[#EBF1D5]"
                  >
                    <p className="capitalize">{friend.name}</p>
                    <button
                      onClick={() => handleRemoveFriend(friend)}
                      className={`px-2 h-full -mt-[2px] ${
                        deleteConfirmMap[friend._id] ? 'bg-red-500' : 'bg-transparent'
                      }`}
                    >
                      ×
                    </button>
                  </div>
                ))} */}
                            {groupSelect && (<>
                                <p className="uppercae text-[14px] text-[#EBF1D5] w-full mb-1">GROUP SELECTED</p>
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

                            {/* {!groupSelect && <div className="flex grow justify-end ms-16">
                  {!isMePresent && (
                    <button
                      onClick={addMe}
                      className="text-sm border border-[#EBF1D5] text-[#EBF1D5] px-3 py-1 rounded-xl hover:bg-[#3a3a3a] transition"
                    >
                      + Add Me
                    </button>
                  )}
                                </div>} */}
                        </div>

                        {selectedFriends.length > 0 && val === '' && (
                            <div className="flex flex-col mt-4 gap-4 w-full">
                                <div className="flex flex-row w-full">
                                    <input
                                        className="w-full text-[#EBF1D5] text-[20px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3 flex-1"

                                        placeholder="Description"
                                        value={desc}
                                        onChange={(e) => setDesc(e.target.value)}
                                    />
                                </div>
                                <input
                                    className="w-full text-[#EBF1D5] text-[20px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3 flex-1"
                                    type="number"
                                    placeholder="Amount"
                                    value={amount}
                                    onChange={(e) => setAmount(parseInt(e.target.value))}
                                />
                                {desc.length > 0 && amount > 0 && (
                                    <div className="flex flex-col gap-4">
                                        <p className="text-lg font-medium">Paid by</p>

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
                                                        className={`px-3 py-1 rounded-xl border-2 cursor-pointer transition-all text-sm ${paying ? 'bg-green-300 text-black border-green-300' : 'bg-transparent text-[#EBF1D5] border-[#81827C]'
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
                                        {!isPaidAmountValid() && <div className="text-[#EBF1D5] text-sm gap-[2px] text-center font-mono w-full flex flex-col justify-center">
                                            <p>₹{getPaidAmountInfoTop()} / ₹{amount.toFixed(2)}</p>
                                            <p className="text-[#a0a0a0]">₹{getPaidAmountInfoBottom()} left</p>
                                        </div>}
                                        <p className="text-lg font-medium">Owed by</p>


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
                                                        className={`px-3 py-1 rounded-xl border-2 cursor-pointer transition-all text-sm ${owing ? 'bg-green-300 text-black border-green-300' : 'bg-transparent text-[#EBF1D5] border-[#81827C]'
                                                            }`}
                                                    >
                                                        <p className="capitalize">{friend.name}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* 1. Mode Selection */}
                                        <div className="flex gap-4">
                                            <button
                                                onClick={() => toggleMode("equal")}
                                                className={`px-4 py-1 text-[12px] rounded-md border border-1 ${mode === "equal" ? "bg-green-300 text-[#000] border-green-300 font-bold" : "bg-transparent text-[#EBF1D5]"}`}
                                            >
                                                =
                                            </button>
                                            <button
                                                onClick={() => toggleMode("value")}
                                                className={`px-4 py-1 text-[12px] rounded-md border border-1 ${mode === "value" ? "bg-green-300 text-[#000] border-green-300 font-bold" : "bg-transparent text-[#EBF1D5]"}`}
                                            >
                                                1.23
                                            </button>
                                            <button
                                                onClick={() => toggleMode("percent")}
                                                className={`px-4 py-1 text-[12px] rounded-md border border-1 ${mode === "percent" ? "bg-green-300 text-[#000] border-green-300 font-bold" : "bg-transparent text-[#EBF1D5]"}`}
                                            >
                                                %
                                            </button>
                                        </div>

                                        {/* 2. Amount input view for multiple owe-ers */}
                                        {selectedFriends.filter(f => f.owing).length > 1 && (
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
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="w-full flex items-start pt-[20px] justify-start align-middle h-[150px]">
                {shouldShowSubmitButton() ? (
                    <button
                        type="submit"
                        onClick={() => handleSubmitExpense()}
                        className="w-full py-2 border border-1 bg-green-300 border-green-300 rounded text-[#000]"
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
        </MainLayout>
    );
};

export default AddExpense;

