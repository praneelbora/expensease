// src/pages/AddLoan.jsx
import { useEffect, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import { useAuth } from "../context/AuthContext";
import { ChevronLeft, Loader } from "lucide-react";
import { getFriends } from "../services/FriendService";
import { createLoan } from "../services/LoanService";
import { useLocation, useNavigate } from "react-router-dom";
import { logEvent } from "../utils/analytics";

const AddLoan = () => {
    const { userToken } = useAuth() || {};
    const [loading, setLoading] = useState(true);
    const location = useLocation();
    const navigate = useNavigate();
    // read it ONCE
    const initialFromFriendId = location.state?.friendId || null;

    // flags that won't get wiped when you clear location.state
    const fromFriendIdRef = useRef(initialFromFriendId);
    const cameFromFriendDetailsRef = useRef(!!initialFromFriendId);

    // control whether user can change friend (hide Remove/back until they opt in)
    const [allowChangeFriend, setAllowChangeFriend] = useState(!cameFromFriendDetailsRef.current);
    // friends
    const [friends, setFriends] = useState([]);
    const [filteredFriends, setFilteredFriends] = useState([]);
    const [search, setSearch] = useState("");
    const [counterparty, setCounterparty] = useState(null); // selected friend object

    // form
    const [iAm, setIAm] = useState(""); // '', 'lender', 'borrower'
    const [principal, setPrincipal] = useState("");
    const [currency, setCurrency] = useState("INR");
    const [interestRate, setInterestRate] = useState("");
    const [estimatedReturnDate, setEstimatedReturnDate] = useState("");
    const [description, setDescription] = useState("");
    const [notes, setNotes] = useState("");

    const initialMount = useRef(false);

    useEffect(() => {
        const run = async () => {
            try {
                const list = await getFriends(userToken);
                setFriends(list || []);
                setFilteredFriends(list || []);
            } catch (e) {
                console.error("Failed to load friends", e);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [userToken]);

    useEffect(() => {
        if (!initialMount.current) {
            initialMount.current = true;
            return;
        }
        const q = search.toLowerCase();
        const filtered = friends
            .map((f) => ({ ...f, selected: counterparty?._id === f._id }))
            .filter(
                (f) =>
                    f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q)
            )
            .sort((a, b) => (b.selected === true) - (a.selected === true));
        setFilteredFriends(filtered);
    }, [search, friends, counterparty]);

    const canSubmit =
        !!counterparty &&
        (iAm === "lender" || iAm === "borrower") &&
        Number(principal) > 0 &&
        description.trim().length > 0;

    const resetAll = () => {
        setCounterparty(null);
        setIAm("");
        setPrincipal("");
        setCurrency("INR");
        setInterestRate("");
        setEstimatedReturnDate("");
        setDescription("");
        setNotes("");
        setSearch("");
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;

        try {
            const payload = {
                lenderId: iAm === "lender" ? "me" : counterparty._id,
                borrowerId: iAm === "borrower" ? "me" : counterparty._id,
                principal: Number(principal),
                currency,
                interestRate: interestRate === "" ? 0 : Number(interestRate),
                estimatedReturnDate: estimatedReturnDate || undefined,
                description: description.trim(),
                notes: notes.trim() || undefined,
            };

            // If your backend resolves "me" from auth, you're done.
            // Otherwise map "me" to current user id here before submit.
            logEvent('loan_added', {
                screen: 'add_loan',
                currency: currency,
                amount: principal
            })
            await createLoan(payload, userToken);
            resetAll();
            if (cameFromFriendDetailsRef) {
                navigate(`/friends/${fromFriendIdRef.current}?tab=loan`); // go back to friend details
            } else {
                alert("Loan created ✅");
            }

        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to create loan");
        }
    };
    const preselectAppliedRef = useRef(false);
    useEffect(() => {
        // already preselected? bail
        if (preselectAppliedRef.current) return;

        // only preselect if we DID come from friend page AND haven't unlocked AND no selection yet
        if (!fromFriendIdRef.current || allowChangeFriend || friends.length === 0 || counterparty) return;

        const pre = friends.find(f => f._id === fromFriendIdRef.current);
        if (pre) setCounterparty(pre);

        preselectAppliedRef.current = true; // <- prevent future re-runs
        navigate(".", { replace: true, state: {} }); // optional cleanup
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [friends, counterparty, allowChangeFriend]);


    const getMissingMessage = () => {
        if (!counterparty) return "Select a friend to start.";
        if (!iAm) return "Choose “I lent” or “I borrowed”.";
        if (!description.trim()) return "Add a description.";
        if (!principal || Number(principal) <= 0) return "Enter the loan amount.";
        return "Fill in all required details.";
    };
    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        {cameFromFriendDetailsRef.current && !allowChangeFriend && (
                            <button onClick={() => navigate(`/friends/${fromFriendIdRef.current}?tab=loan`)}>
                                <ChevronLeft />
                            </button>
                        )}
                        <h1 className="text-3xl font-bold capitalize">Add a Loan</h1>
                    </div>
                </div>



                <div className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar">
                    {loading ? (
                        <div className="flex flex-1 items-center justify-center">
                            <Loader />
                        </div>
                    ) : (
                        <div className="flex w-full flex-col gap-4">
                            {/* STEP 1: Pick exactly one friend */}
                            {!counterparty && (
                                <div className="mt-2">
                                    <p className="text-[13px] text-[#81827C] mb-2">
                                        Select a friend (loan is strictly between two people).
                                    </p>
                                    <input
                                        className="w-full bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3"
                                        placeholder="Search friends"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 mt-3">
                                        {filteredFriends.map((friend) => (
                                            <div
                                                key={friend._id}
                                                onClick={() => setCounterparty(friend)}
                                                className="flex flex-col gap-1 cursor-pointer hover:bg-[#1f1f1f] py-2 rounded-md transition px-2"
                                            >
                                                <h2 className="text-xl font-semibold capitalize">
                                                    {friend.name}
                                                </h2>
                                                <p className="text-[#81827C] lowercase">{friend.email}</p>
                                                <hr className="border-[#333]" />
                                            </div>
                                        ))}
                                        {filteredFriends.length === 0 && (
                                            <p className="text-[#81827C]">
                                                No friends found. Add friends to record loans.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* After friend selected: show chip + Change button, then STEP 2 */}
                            {counterparty && (
                                <>
                                    <div className="flex flex-col gap-2 mt-2">
                                        <span className="text-[13px] text-teal-500 uppercase">
                                            Friend Selected
                                        </span>
                                        <div className="flex justify-between items-center h-[30px] gap-2 text-xl text-[#EBF1D5]">
                                            <p className="capitalize">{counterparty.name}</p>
                                            {allowChangeFriend && (
                                                <button
                                                    onClick={() => {
                                                        setCounterparty(null);
                                                        setIAm("");
                                                        fromFriendIdRef.current = null;      // <- stop auto-reselect
                                                        preselectAppliedRef.current = true;  // <- don't try again
                                                    }}
                                                    className="px-2 text-sm text-red-500"
                                                    title="Change friend"
                                                >
                                                    Remove
                                                </button>
                                            )}

                                        </div>

                                    </div>

                                    {/* STEP 2: I lent / I borrowed */}
                                    <div className="inline-flex border border-[#EBF1D5] rounded-full p-1 bg-[#1f1f1f] self-start">
                                        <button
                                            onClick={() => setIAm("lender")}
                                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${iAm === "lender"
                                                ? "bg-[#EBF1D5] text-[#121212]"
                                                : "text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                                }`}
                                        >
                                            I lent
                                        </button>
                                        <button
                                            onClick={() => setIAm("borrower")}
                                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${iAm === "borrower"
                                                ? "bg-[#EBF1D5] text-[#121212]"
                                                : "text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                                }`}
                                        >
                                            I borrowed
                                        </button>
                                    </div>

                                    {/* Form (only once friend is chosen) */}
                                    <div className="flex flex-col gap-3 mt-4 w-full">
                                        <input
                                            className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 pl-3"
                                            placeholder="Description (e.g., Short-term loan)"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                        />

                                        <div className="flex gap-4">
                                            <input
                                                className="flex-1 text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 pl-3"
                                                type="number"
                                                placeholder="Principal amount"
                                                value={principal}
                                                onChange={(e) => setPrincipal(e.target.value)}
                                            />
                                            <select
                                                className="w-[130px] text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2"
                                                value={currency}
                                                onChange={(e) => setCurrency(e.target.value)}
                                            >
                                                <option value="INR">INR</option>
                                                <option value="USD">USD</option>
                                                <option value="EUR">EUR</option>
                                            </select>
                                        </div>

                                        {/* <div className="flex gap-4">
                      <input
                        className="flex-1 text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 pl-3"
                        type="number"
                        step="0.01"
                        placeholder="Interest rate (annual %, optional)"
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value)}
                      />
                      <input
                        className="flex-1 text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 pl-3"
                        type="date"
                        value={estimatedReturnDate}
                        onChange={(e) => setEstimatedReturnDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        placeholder="Estimated return date"
                      />
                    </div> */}

                                        <textarea
                                            className="w-full text-[#EBF1D5] text-[16px] border border-[#55554f] rounded-md p-3 min-h-[90px]"
                                            placeholder="Notes (optional)"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                        />
                                    </div>
                                    {/* Summary before Submit */}
                                    {counterparty && principal > 0 && iAm && (
                                        <div className="bg-[#1f1f1f] border border-[#55554f] rounded-md p-4 text-sm">
                                            <p>
                                                {iAm === "lender" ? "You lent" : "You borrowed"}{" "}
                                                <span className="font-bold">
                                                    {currency} {Number(principal).toLocaleString()}
                                                </span>{" "}
                                                {iAm === "lender" ? "to" : "from"}{" "}
                                                <span className="font-bold">{counterparty.name}</span>.
                                            </p>
                                            {interestRate && Number(interestRate) > 0 && (
                                                <p>
                                                    Interest Rate: <span className="font-bold">{interestRate}% p.a.</span>
                                                </p>
                                            )}
                                            {estimatedReturnDate && (
                                                <p>
                                                    Expected Return Date:{" "}
                                                    <span className="font-bold">
                                                        {new Date(estimatedReturnDate).toLocaleDateString()}
                                                    </span>
                                                </p>
                                            )}
                                            {description && (
                                                <p>
                                                    Description: <span className="italic">{description}</span>
                                                </p>
                                            )}
                                            {notes && (
                                                <p>
                                                    Notes: <span className="italic">{notes}</span>
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Submit + Clear */}
                                    <div className="w-full flex gap-3 mt-3">
                                        {canSubmit ? (
                                            <button
                                                onClick={handleSubmit}
                                                className="flex-1 py-2 bg-teal-300 border border-teal-300 rounded text-[#000]"
                                            >
                                                Save Loan
                                            </button>
                                        ) : (
                                            <div className="flex-1 text-[#a0a0a0] text-sm text-center flex items-center justify-center border border-[#55554f] rounded">
                                                {getMissingMessage()}
                                            </div>

                                        )}

                                        <button
                                            type="button"
                                            onClick={resetAll}
                                            className="w-[100px] py-2 border border-[#EBF1D5] rounded text-[#EBF1D5] hover:bg-[#2a2a2a] transition"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    {cameFromFriendDetailsRef.current && !allowChangeFriend && (
                                        <div className="mt-6 mb-4 text-center text-sm text-[#a0a0a0]">
                                            Want to add a loan with someone else?{" "}
                                            <button
                                                className="text-teal-400 underline"
                                                onClick={() => {
                                                    setAllowChangeFriend(true);   // unlock
                                                    setCounterparty(null);
                                                    setCounterparty(null);
                                                    setIAm("");
                                                }}
                                            >
                                                Choose another friend
                                            </button>
                                        </div>
                                    )}



                                </>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </MainLayout>
    );
};

export default AddLoan;
