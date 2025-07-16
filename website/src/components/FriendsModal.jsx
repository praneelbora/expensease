import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Cookies from 'js-cookie'

export default function Navbar({ setShowModal, showModal, fetchFriends }) {
    const [val, setVal] = useState('')
    const [sent, setSent] = useState([])
    const [received, setreceived] = useState([])
    const addFriend = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/friends/request`, {
                headers: {
                    "Content-Type": "application/json",
                    'x-auth-token': Cookies.get('userToken')
                },
                method: 'POST',
                body: JSON.stringify({ email: val })
            });

            if (!response.ok) {
                throw new Error("Failed to add friend");
            }
            else {
                fetchFriends()
                setShowModal(false)
            }
        } catch (error) {
            console.error("Error Sending Request:", error);
        } 
    };
    const sentRequests = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/friends/sent`, {
                headers: {
                    "Content-Type": "application/json",
                    'x-auth-token': Cookies.get('userToken')
                },
            });

            if (!response.ok) {
                throw new Error("Failed to add friend");
            }
            else {
                const responseJson = await response.json()
                console.log(responseJson);

                setSent(responseJson)
            }
        } catch (error) {
            console.error("Error Sending Request:", error);
        }
    };
    const receivedRequests = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/friends/received`, {
                headers: {
                    "Content-Type": "application/json",
                    'x-auth-token': Cookies.get('userToken')
                },
            });

            if (!response.ok) {
                throw new Error("Failed to add friend");
            }
            else {
                setreceived(await response.json())
            }
        } catch (error) {
            console.error("Error Sending Request:", error);
        }
    };
    useEffect(() => {
        sentRequests()
        receivedRequests()
    }, [])
    if (showModal) return (

        <>
            <div
                className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-[5000] outline-none focus:outline-none backdrop-blur-sm bg-[rgba(0,0,0,0.2)]"
                onClick={() => setShowModal(false)}
            >
                <div className="relative my-6 mx-auto w-[95dvw] lg:w-[80dvw] xl:w-[40dvw] h-auto px-3" onClick={(e) => e.stopPropagation()}>
                    {/*content*/}
                    <div className="rounded-[24px] shadow-lg relative flex flex-col w-full bg-[#212121]">
                        {/*header*/}
                        <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-[rgba(255,255,255,0.1)]">
                            <h3 className="text-2xl font-semibold text-[#EBF1D5]">
                                Friends
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
                        <div className="w-full flex flex-col p-5 gap-6">
                            <div className="w-full flex flex-row gap-3">
                                <input
                                    className="bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3 flex-1"

                                    placeholder='Enter Email ID'
                                    value={val}
                                    onChange={(e) => setVal(e.target.value)} />
                                <button className="border-[#EBF1D5] text-[#EBF1D5] border-[1px] h-[40px] px-2 rounded-md" onClick={() => addFriend()}>Add</button>
                            </div>
                            <div className="w-full gap-3">
                                {received.length > 0 &&
                                    <div className="flex flex-col gap-2">
                                        <p className="uppercase text-[#EBF1D5]">Received Requests</p>
                                        <div className="w-full flex flex-col">
                                            <hr />
                                            {received.map((req) => {
                                                return (
                                                    <div className="flex flex-col gap-2 pt-2">
                                                        <div className="flex flex-row w-full h-[50px] justify-between items-center">
                                                            <div className="flex flex-col h-full justify-around">
                                                                <p className="text-[20px] text-[#EBF1D5] capitalize">{req.sender.name}</p>
                                                                <p className="text-[12px] text-[#EBF1D5] lowercase">{req.sender.email}</p>
                                                            </div>
                                                            <div className="flex flex-row w-min gap-2">
                                                                <button className="border-[#34C759] text-[#34C759] border-[1px] h-[40px] w-[40px] px-2 rounded-md" onClick={() => addFriend()}>Y</button>
                                                                <button className="border-[#EA4335] text-[#EA4335] border-[1px] h-[40px] w-[40px] px-2 rounded-md" onClick={() => addFriend()}>N</button>
                                                            </div>
                                                        </div>
                                                        <hr />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>}
                                {sent.length > 0 &&
                                    <div className="flex flex-col gap-2">
                                        <p className="uppercase text-[#EBF1D5]">Sent Requests</p>
                                        <div className="w-full flex flex-col">
                                            <hr />
                                            {sent.map((req) => {
                                                return (
                                                    <div className="flex flex-col gap-2 pt-2">
                                                        <div className="flex flex-row w-full h-[50px] justify-between items-center">
                                                            <div className="flex flex-col h-full justify-around">
                                                                <p className="text-[20px] text-[#EBF1D5] capitalize">{req.receiver.name}</p>
                                                                <p className="text-[12px] text-[#EBF1D5] lowercase">{req.receiver.email}</p>
                                                            </div>
                                                            <div className="flex flex-row w-min">
                                                                <button className="border-[#EA4335] text-[#EA4335] border-[1px] h-[40px] px-2 rounded-md" onClick={() => addFriend()}>Cancel</button>
                                                            </div>
                                                        </div>
                                                        <hr />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
        </>
    );
}
