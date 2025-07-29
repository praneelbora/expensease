import { useContext, useEffect, useState } from 'react';
import { getUserCategories, saveUserCategories } from '../services/UserService';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { ArrowUpDown, X } from 'lucide-react';
import { HTML5Backend } from 'react-dnd-html5-backend';
import React, { useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const DraggableCategory = ({ category, index, moveCategory, removeCategory }) => {
    const ref = useRef(null);
    const dragRef = useRef(null);

    const [, drag] = useDrag({
        type: 'CATEGORY',
        item: { index },
    });

    const [, drop] = useDrop({
        accept: 'CATEGORY',
        hover: (draggedItem) => {
            if (draggedItem.index !== index) {
                moveCategory(draggedItem.index, index);
                draggedItem.index = index;
            }
        },
    });

    drop(ref);
    drag(dragRef);

    return (
        <div
            ref={ref}
            className="flex justify-between items-center mb-2 gap-2"
            style={{ touchAction: 'none' }}
        >
            <div className="flex flex-1 justify-between items-center gap-2 bg-[#2A2A2A] py-1 px-2 rounded">
                <span className="select-none touch-none">{category.emoji} {category.name}</span>
                <button
                    ref={dragRef}
                    className="cursor-grab active:cursor-grabbing text-white hover:opacity-80 px-2 py-1"
                    style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                >
                    <ArrowUpDown size={20} />
                </button>
            </div>
            <button onClick={() => removeCategory(index)} className="text-red-400">
                <X />
            </button>
        </div>
    );
};

const arraysEqual = (a, b) => {
    if (a.length !== b.length) return false;
    return a.every((item, i) =>
        item.name === b[i].name &&
        item.emoji === b[i].emoji &&
        item.id === b[i].id
    );
};

const SettingsCategoryManager = ({ userToken }) => {
    const { categories } = useAuth() || {}
    const [newCategories, setNewCategories] = useState(categories);
    const [newCategory, setNewCategory] = useState({ name: '', emoji: '' });
    const moveCategory = (from, to) => {
        const updated = [...newCategories];
        const [moved] = updated.splice(from, 1);
        updated.splice(to, 0, moved);
        setNewCategories(updated);
    };

    const removeCategory = (index) => {
        setNewCategories(newCategories.filter((_, i) => i !== index));
    };

    const addCategory = () => {
        if (newCategory.name && newCategory.emoji) {
            setNewCategories([...newCategories, { ...newCategory, id: Date.now() }]);
            setNewCategory({ name: '', emoji: '' });
        }
    };

    const handleSave = async () => {
        await saveUserCategories(newCategories, userToken);
        alert("Categories saved!");
        setCategories(newCategories); // Update reference
    };

    const handleUndo = async () => {
        setNewCategories(categories); // Update reference
    };

    const hasChanges = !arraysEqual(newCategories, categories);

    return (
        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
            <h2 className="text-xl font-semibold mb-4">Customize Categories</h2>
            <DndProvider backend={HTML5Backend}>
                {newCategories.map((cat, index) => (
                    <DraggableCategory
                        key={cat._id}
                        index={index}
                        category={cat}
                        moveCategory={moveCategory}
                        removeCategory={removeCategory}
                    />
                ))}
            </DndProvider>

            <div className="flex items-center gap-2 mt-4">
                <input
                    className="flex-2/3 bg-[#2A2A2A] text-white px-2 py-1 rounded w-1/2"
                    placeholder="Name"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                />
                <input
                    className="flex-1/3 bg-[#2A2A2A] text-white px-2 py-1 rounded w-1/2"
                    placeholder="Emoji"
                    value={newCategory.emoji}
                    onChange={(e) => setNewCategory({ ...newCategory, emoji: e.target.value })}
                />
                <button onClick={addCategory} className="bg-teal-500 px-2 py-1 rounded text-sm">Add</button>
            </div>
                {hasChanges && <div className='flex flex-1 w-full gap-2'>
            {hasChanges && (
                <button
                onClick={handleUndo}
                className="flex-2/5 mt-4 bg-red-500 px-4 py-2 rounded text-white"
                >
                    Undo
                </button>
            )}
            {hasChanges && (
                <button
                onClick={handleSave}
                className="flex-3/5 mt-4 bg-teal-600 px-4 py-2 rounded text-white"
                >
                    Save Changes
                </button>
            )}
            </div>}
        </div>
    );
};

export default SettingsCategoryManager;
