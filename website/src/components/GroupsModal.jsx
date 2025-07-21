import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { joinGroup, createGroup } from "../services/GroupService";
import { getFriends } from "../services/FriendService";

export default function Navbar({ setShowModal, showModal, fetchGroups }) {
    const { userToken } = useAuth() || {}
    const [val, setVal] = useState('')
    const [name, setName] = useState('')
    const [friends, setFriends] = useState([]);
    const [filteredFriends, setFilteredFriends] = useState([]);
    const [selectedFriends, setSelectedFriends] = useState([{ _id: 'me', name: 'Me', paying: false, owing: false, oweAmount: 0, owePercent: 0 }]);
    const [deleteConfirmMap, setDeleteConfirmMap] = useState({});
    const [groupMode, setGroupMode] = useState('create'); // 'create' or 'join'
    const [joinCode, setJoinCode] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [groupCreatedCode, setGroupCreatedCode] = useState('');


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

    const handleJoinGroup = async () => {
        setErrorMessage(''); // Clear previous
        try {
            const data = await joinGroup(joinCode, userToken)

            if (!response.ok) {
                throw new Error(data.message || "Failed to join group");
            }

            fetchGroups();
            setJoinCode('');
            setErrorMessage('');
            setGroupCreatedCode('')
            setShowModal(false);
        } catch (error) {
            console.error("Join group error:", error.message);
            setErrorMessage(error.message);
        }
    };


    const handleFetchFriends = async () => {
        try {
            const data = await getFriends(userToken)
            if (data.length > 0) {
                setFriends(data);
                friendFilter('');
            }
        } catch (error) {
            console.error("Error loading friends:", error);
        } finally {
        }
    };
    useEffect(() => {
        setGroupMode('create');
        setJoinCode('');
        showModal && handleFetchFriends()

    }, [showModal])
    useEffect(() => {
        setErrorMessage('')
    }, [joinCode])
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
    try {
        const data = await createGroup(name, selectedFriends, userToken);
        fetchGroups();
        setGroupCreatedCode(data?.code || '');
        setName('');
        setSelectedFriends([{ _id: 'me', name: 'Me', paying: false, owing: false, oweAmount: 0, owePercent: 0 }]);
        setErrorMessage('');
    } catch (error) {
        setErrorMessage(error.message);
    }
};




    useEffect(() => {
        friends.length > 0 && friendFilter(val)
    }, [val, friends])
    if (showModal) return (
        <>
            <div
                className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-[5000] outline-none focus:outline-none backdrop-blur-sm bg-[rgba(0,0,0,0.2)]"
                onClick={() => {
                    setErrorMessage('');
                    setJoinCode('');
                    setGroupCreatedCode('');
                    setShowModal(false);
                }}
            >
                <div className="relative my-6 mx-auto w-[95dvw] lg:w-[60dvw] xl:w-[50dvw] h-auto px-3" onClick={(e) => e.stopPropagation()}>
                    {/*content*/}
                    <div className="rounded-[24px] shadow-lg relative flex flex-col w-full bg-[#212121]">
                        {/*header*/}
                        <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-[rgba(255,255,255,0.1)]">

                            <h3 className="text-2xl font-semibold text-[#EBF1D5]">
                                Add a Group
                            </h3>

                            <button
                                className="absolute top-[13px] right-[12px] p-1 ml-auto bg-transparent border-0 text-[#EBF1D5] float-right text-2xl leading-none font-semibold outline-none focus:outline-none"
                                onClick={() => {
                                    setErrorMessage('');
                                    setJoinCode('');
                                    setGroupCreatedCode('');
                                    setShowModal(false);
                                }}
                            >
                                <span className="bg-transparent text-[#EBF1D5] h-6 w-6 block outline-none focus:outline-none">
                                    ×
                                </span>
                            </button>
                        </div>

                        {/*body*/}
                        <div className="w-full flex flex-col p-3 gap-6 max-h-[70dvh]">
                            {groupCreatedCode ? (
                                <div className="flex flex-col items-center justify-center  text-teal-200 rounded-lg text-center">
                                    <p className="text-lg font-semibold">🎉 Group Created Successfully!</p>
                                    <p className="text-sm mt-1">Share this code with friends to join:</p>
                                    <div className="text-2xl font-bold bg-[#EBF1D5] text-[#121212] px-4 py-2 rounded-md mt-2 tracking-widest">
                                        {groupCreatedCode}
                                    </div>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(
                                                `Join my group on SplitFree using this code: ${groupCreatedCode}
Click on this link to login & join now!
${import.meta.env.VITE_FRONTEND_URL}/groups/join/${groupCreatedCode}`
                                            );
                                        }}
                                        className="mt-4 px-4 py-2 bg-teal-500 text-[#121212] rounded-lg hover:bg-teal-400 text-sm font-medium"
                                    >
                                        📋 Copy to Clipboard
                                    </button>
                                </div>
                            ) : <>

                                <div className="flex items-center justify-center">
                                    <div className="flex border border-[#EBF1D5] rounded-full p-1 bg-[#1f1f1f]">
                                        <button
                                            onClick={() => setGroupMode('create')}
                                            className={`px-6 py-1.5 rounded-full text-sm transition-all duration-200 font-medium ${groupMode === 'create'
                                                ? 'bg-[#EBF1D5] text-[#121212]'
                                                : 'text-[#EBF1D5] hover:bg-[#2a2a2a]'
                                                }`}
                                        >
                                            Create Group
                                        </button>
                                        <button
                                            onClick={() => setGroupMode('join')}
                                            className={`px-6 py-1.5 rounded-full text-sm transition-all duration-200 font-medium ${groupMode === 'join'
                                                ? 'bg-[#EBF1D5] text-[#121212]'
                                                : 'text-[#EBF1D5] hover:bg-[#2a2a2a]'
                                                }`}
                                        >
                                            Join Group
                                        </button>
                                    </div>
                                </div>
                                {groupMode === 'create' ? (
                                    // 🔁 CREATE MODE CONTENT (your existing form)
                                    <>
                                        <div className="w-full flex flex-col gap-3">
                                            <input
                                                className="bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3 flex-1"

                                                placeholder='New Group Name'
                                                value={name}
                                                onChange={(e) => setName(e.target.value)} />
                                            <input
                                                className="bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3 flex-1"

                                                placeholder='Search Friends'
                                                value={val}
                                                onChange={(e) => setVal(e.target.value)} />
                                            <div className="flex flex-wrap gap-2">
                                                {selectedFriends.map((friend) => (
                                                    <div
                                                        key={'selected' + friend._id}
                                                        className={`flex items-center gap-1 h-[30px] ${friend._id != 'me' ? 'ps-3' : 'px-3'} overflow-hidden rounded-xl border border-[#81827C] text-sm text-[#EBF1D5]`}
                                                    >
                                                        <p className="capitalize">{friend.name}</p>
                                                        {friend._id != 'me' && <button
                                                            onClick={() => handleRemoveFriend(friend)}
                                                            className={`px-2 h-full pb-[2px] ${deleteConfirmMap[friend._id] ? 'bg-red-500' : 'bg-transparent'
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
                                            </div> : val.length > 0 && selectedFriends.length == 0 && <p className="text-[#55554f]">Please add friends before adding to the group</p>}


                                        </div>
                                    </>) :
                                    (<div className="flex flex-col gap-1">
                                        <input
                                            type="text"
                                            value={joinCode}
                                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                            placeholder="Enter 4-character Group Code"
                                            maxLength={4}
                                            className="bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3 flex-1 uppercase"
                                        />
                                        {errorMessage && (
                                            <p className="text-red-400 text-sm font-medium text-center">
                                                {errorMessage}
                                            </p>
                                        )}

                                    </div>)}
                            </>}</div>
                        {/*footer*/}
                        {!groupCreatedCode && <div className="flex items-center justify-end p-5 border-t border-solid border-[rgba(255,255,255,0.1)] rounded-b">
                            {groupMode === 'create' ? (
                                <button
                                    onClick={handleCreateGroup}
                                    disabled={name.length === 0}
                                    className={`w-full py-2 border rounded-[8px] text-[#000] transition 
            ${name.length > 0
                                            ? 'bg-teal-300 border-teal-300 cursor-pointer'
                                            : 'bg-gray-500 border-gray-500 cursor-not-allowed'}
        `}
                                >
                                    Create Group
                                </button>
                            ) : (
                                <button
                                    onClick={handleJoinGroup}
                                    disabled={joinCode.length !== 4}
                                    className={`w-full py-2 border rounded-[8px] text-[#000] transition 
            ${joinCode.length === 4
                                            ? 'bg-blue-300 border-blue-300 cursor-pointer'
                                            : 'bg-gray-500 border-gray-500 cursor-not-allowed'}
        `}
                                >
                                    Join Group
                                </button>
                            )}


                        </div>}
                        {/* {isLoading2 && <div className="flex items-center justify-end p-6 border-t border-solid border-[rgba(255,255,255,0.1)] rounded-b">
                    <LoaderSmall /> </div>} */}
                    </div>
                </div>
            </div>
            <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
        </>
    );
}
