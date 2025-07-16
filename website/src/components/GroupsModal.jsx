import { useEffect, useState } from "react";
import Cookies from 'js-cookie'

export default function Navbar({ setShowModal, showModal }) {
    const [val, setVal] = useState('')
    const [name, setName] = useState('')
    const [friends, setFriends] = useState([]);
    const [filteredFriends, setFilteredFriends] = useState([]);
    const [selectedFriends, setSelectedFriends] = useState([{ _id: 'me', name: 'Me', paying: false, owing: false, oweAmount: 0, owePercent: 0 }]);
    const [deleteConfirmMap, setDeleteConfirmMap] = useState({});
    // Checks if "Me" is present
    const isMePresent = selectedFriends.some(f => f._id === 'me');

    const handleRemoveFriend = (friend) => {
        if (friend._id === 'me') return; // Don't remove "Me"

        if (deleteConfirmMap[friend._id]) {
            const updatedFriends = friends.map(f => {
                if (f._id === friend._id) {
                    return { ...f, selected: false };
                }
                return f;
            });

            setFriends(updatedFriends);

            // Always include "Me"
            const updatedSelected = [{ _id: 'me', name: 'Me', paying: false, owing: false, oweAmount: 0, owePercent: 0 }]
                .concat(updatedFriends.filter(f => f.selected));

            setSelectedFriends(updatedSelected);

            setDeleteConfirmMap(prev => {
                const copy = { ...prev };
                delete copy[friend._id];
                return copy;
            });

            friendFilter(val);
        } else {
            setDeleteConfirmMap(prev => ({ ...prev, [friend._id]: true }));
        }
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
                    console.log(data);
                    setFriends(data);
                    friendFilter('');
                }
            }
        } catch (error) {
            console.error("Error loading friends:", error);
        } finally {
        }
    };
    useEffect(() => {
        showModal && fetchFriends()
    }, [showModal])
    const toggleFriendSelection = (friend) => {
        if (friend._id === 'me') return; // Skip toggling "Me"

        const updatedFriends = friends.map(f => {
            if (f._id === friend._id) {
                return { ...f, selected: !f.selected };
            }
            return f;
        });

        setFriends(updatedFriends);

        // Always include "Me"
        const updatedSelected = [{ _id: 'me', name: 'Me', paying: false, owing: false, oweAmount: 0, owePercent: 0 }]
            .concat(updatedFriends.filter(f => f.selected));

        setSelectedFriends(updatedSelected);

        friendFilter(val);
    };


    const friendFilter = (val) => {
        const lowerVal = val.toLowerCase();
        const filtered = friends.filter(friend =>
            (friend.name.toLowerCase().includes(lowerVal) || friend.email.toLowerCase().includes(lowerVal)) &&
            !friend.selected
        );
        setFilteredFriends(filtered);
    };

    const handleCreateGroup = async () => {
        if (!name.trim()) return;

        const members = selectedFriends
            .filter(friend => friend._id !== 'me') // exclude "me" from the payload if backend handles it differently
            .map(friend => friend._id);

        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/groups/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-token": Cookies.get('userToken'),
                },
                body: JSON.stringify({ name, memberIds: members }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to create group");
            }

            // Optional: Reset state, close modal, navigate, etc.
            setName('');
            setSelectedFriends([{ _id: 'me', name: 'Me', paying: false, owing: false, oweAmount: 0, owePercent: 0 }]);
            setShowModal(false);
            // navigate(`/groups/${data.group._id}`); // Optional redirect
        } catch (error) {
            console.error("Group creation error:", error.message);
        }
    };



    useEffect(() => {
        friends.length > 0 && friendFilter(val)
    }, [val, friends])
    if (showModal) return (
        <>
            <div
                className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-[5000] outline-none focus:outline-none backdrop-blur-sm bg-[rgba(0,0,0,0.2)]"
                onClick={() => setShowModal(false)}
            >
                <div className="relative my-6 mx-auto w-[95dvw] lg:w-[60dvw] xl:w-[50dvw] h-auto px-3" onClick={(e) => e.stopPropagation()}>
                    {/*content*/}
                    <div className="rounded-[24px] shadow-lg relative flex flex-col w-full bg-[#212121]">
                        {/*header*/}
                        <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-[rgba(255,255,255,0.1)]">
                            <h3 className="text-2xl font-semibold text-[#EBF1D5]">
                                New Group
                            </h3>
                            <button
                                className="absolute top-[13px] right-[12px] p-1 ml-auto bg-transparent border-0 text-[#EBF1D5] float-right text-2xl leading-none font-semibold outline-none focus:outline-none"
                                onClick={() => setShowModal(false)}
                            >
                                <span className="bg-transparent text-[#EBF1D5] h-6 w-6 block outline-none focus:outline-none">
                                    ×
                                </span>
                            </button>
                        </div>

                        {/*body*/}
                        <div className="w-full flex flex-col p-5 gap-6 max-h-[70dvh]">
                            <div className="w-full flex flex-col gap-3">
                                <input
                                    className="bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3 flex-1"

                                    placeholder='New Group Name'
                                    value={name}
                                    onChange={(e) => setName(e.target.value)} />
                            </div>
                            <div className="w-full flex flex-col gap-4">
                                <input
                                    className="bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3 flex-1"

                                    placeholder='Search Friends'
                                    value={val}
                                    onChange={(e) => setVal(e.target.value)} />
                                <div className="flex flex-wrap gap-2">
                                    {selectedFriends.map((friend) => (
                                        <div
                                            key={'selected' + friend._id}
                                            className={`flex w-min items-center h-[30px] gap-2 ${friend._id != 'me' ? 'ps-3' : 'px-3'} overflow-hidden rounded-xl border border-[#81827C] text-sm text-[#EBF1D5]`}
                                        >
                                            <p className="capitalize">{friend.name}</p>
                                            {friend._id != 'me' && <button
                                                onClick={() => handleRemoveFriend(friend)}
                                                className={`px-2 h-full -mt-[2px] ${deleteConfirmMap[friend._id] ? 'bg-red-500' : 'bg-transparent'
                                                    }`}
                                            >
                                                ×
                                            </button>}
                                        </div>
                                    ))}

                                </div>
                                {/* {(selectedFriends.length === 0 || val.length > 0) && ( */}
                                {filteredFriends.length > 0 ? <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 px-2 max-h-[40dvh] overflow-scroll`}>
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
                                    ))}
                                </div> : val.length > 0 && <p className="text-[#55554f]">Please add friends before adding to the group</p>}


                            </div>
                        </div>
                        {/*footer*/}
                        <div className="flex items-center justify-end p-5 border-t border-solid border-[rgba(255,255,255,0.1)] rounded-b">
                            {name.length > 0 && (
                                <button
                                    type="submit"
                                    onClick={() => handleCreateGroup()}
                                    className="w-full py-2 border border-1 bg-green-300 border-green-300 rounded text-[#000]"
                                >
                                    Create Group
                                </button>
                            )}
                        </div>
                        {/* {isLoading2 && <div className="flex items-center justify-end p-6 border-t border-solid border-[rgba(255,255,255,0.1)] rounded-b">
                <LoaderSmall /> </div>} */}
                    </div>
                </div>
            </div>
            <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
        </>
    );
}
