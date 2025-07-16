import React, { useEffect, useState, useContext } from "react";
import MainLayout from '../layouts/MainLayout';
import Modal from '../components/GroupsModal';
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
const Groups = () => {
    const navigate = useNavigate();
    const { userToken } = useAuth()
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    const fetchGroups = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/groups/`, {
                headers: {
                    "Content-Type": "application/json",
                    'x-auth-token': userToken
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
            console.error("Groups Page - Error loading groups:", error);
        } finally {
            setLoading(false);
        }
    };


    useEffect(() => {
        if (!userToken) return;
        fetchGroups();
    }, [userToken]);

    return (
        <MainLayout>
            <div className="max-h-screen bg-[#121212] text-[#EBF1D5]">
                <div className="flex flex-row justify-between">
                    <h1 className="text-3xl font-bold mb-6">Groups</h1>
                    <button className="border-[1px] h-[40px] px-2 rounded-md" onClick={() => setShowModal(true)}>Add New</button>
                </div>
                {loading ? (
                    <p>Loading groups...</p>
                ) : groups.length === 0 ? (
                    <p>No groups found.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
                        {groups.map((group) => (
                            <div
                                key={group._id}
                                onClick={() => navigate(`/groups/${group._id}`)}
                                className="flex flex-col gap-1 cursor-pointer hover:bg-[#1f1f1f] py-1 rounded-md transition"
                            >
                                <h2 className="text-xl font-semibold capitalize">{group.name}</h2>
                                <hr />
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <Modal setShowModal={setShowModal} showModal={showModal} fetchGroups={fetchGroups} />

        </MainLayout>
    );
};

export default Groups;
