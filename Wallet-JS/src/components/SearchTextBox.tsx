import React, { useState } from 'react';
import { TextField, InputAdornment, IconButton, Box } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

interface SearchBoxProps {
    placeholder?: string;
    onSearch?: (searchTerm: string) => void;
}

export default function SearchBox(props: SearchBoxProps) {
    const [searchTerm, setSearchTerm] = useState<string>("");

    function handleSearch() {
        if (props.onSearch) {
            props.onSearch(searchTerm);
        }
    }

    return (
        <Box>
            <TextField
                fullWidth
                placeholder={props.placeholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                    endAdornment: (
                        <InputAdornment position="end">
                            <IconButton onClick={handleSearch}>
                                <SearchIcon />
                            </IconButton>
                        </InputAdornment>
                    )
                }}
            />
        </Box>
    );
}