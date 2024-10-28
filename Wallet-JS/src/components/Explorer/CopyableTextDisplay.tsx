/**
 * A component for displaying a text and a copy button that copies the text to the clipboard
 * When successfully copied, a "Copied!" snackbar will appear
 */

import React, { useState } from 'react';
import { Box, Card, IconButton, Stack, TextField } from '@mui/material';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import Snackbar from '@mui/material/Snackbar';
import TextboxWithCopyAndQR from './TextboxWithCopyAndQR';

class CopyableTextDisplayProps {
    label: string = "";
    text: string = "";
    linkTo?: string = "";
}

export function CopyableTextDisplay(props: CopyableTextDisplayProps){
    const [isCopied, setIsCopied] = useState<boolean>(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(props.text);
        setIsCopied(true);
        setTimeout(() => {
            setIsCopied(false);
        }, 2000);
    }

    return (
        <div>
            <Stack direction="row" spacing={0} alignItems={"center"}>
                <Box>{props.label}</Box>
                <TextboxWithCopyAndQR text={props.text} truncateText={true} linkTo={props.linkTo} />
            </Stack>
            <Snackbar open={isCopied} message="Copied" />
        </div>
    );
}