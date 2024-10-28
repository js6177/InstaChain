import React, { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ContentCopy, QrCode } from '@mui/icons-material'
import { 
  TextField, 
  IconButton, 
  Dialog, 
  DialogTitle, 
  DialogContent,
  Snackbar,
  Alert,
  Typography
} from '@mui/material'
import { styled } from '@mui/material/styles'
import { Link } from 'react-router-dom'

const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    paddingRight: theme.spacing(1),
    paddingLeft: theme.spacing(1),
  },
  '& .MuiInputBase-input': {
    paddingLeft: theme.spacing(5),
    paddingRight: theme.spacing(5),
    textAlign: 'center', // Add this line to center the text
  },
}))

const ButtonWrapper = styled('div')({
  position: 'absolute',
  top: 0,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
})

const LeftButtonWrapper = styled(ButtonWrapper)({
  left: 8,
})

const RightButtonWrapper = styled(ButtonWrapper)({
  right: 8,
})

export class TextboxWithCopyAndQRProps {
    label?: string = "";
    text: string = "";
    linkTo?: string;
    readonly?: boolean = false;
    truncateText?: boolean = false; // If true, would only display the first and last n characters of the string
    truncatedCharacterCount?: number = 4; // If truncateText is true, this value represents the number of characters to display at the beginning and end of the string
}

export default function TextboxWithCopyAndQR(props: TextboxWithCopyAndQRProps) {
    const {text, linkTo = null, readonly = true, truncateText = true, truncatedCharacterCount = 4} = props;
    let textBoxValue = text;
    if (truncateText) {
        textBoxValue = textBoxValue.slice(0, truncatedCharacterCount) + "..." + textBoxValue.slice(-truncatedCharacterCount);
    }
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success')

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setSnackbarMessage('Copied to clipboard')
      setSnackbarSeverity('success')
      setSnackbarOpen(true)
    } catch (err) {
      setSnackbarMessage('Failed to copy')
      setSnackbarSeverity('error')
      setSnackbarOpen(true)
    }
  }

  const handleCloseSnackbar = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return
    }
    setSnackbarOpen(false)
  }

  return (
    <div style={{ position: 'relative', maxWidth: '400px' }}>
      {linkTo !== null ? 
      (   
      <Link to={linkTo}>
        <StyledTextField
        fullWidth
        value={textBoxValue}
        InputProps={{
          readOnly: readonly,
        }}
        variant="outlined"
      />
      </Link>) : (
        <StyledTextField
        fullWidth
        value={textBoxValue}
        InputProps={{
          readOnly: readonly,
        }}
        variant="outlined"
      />)
      }

      <LeftButtonWrapper>
        <IconButton
          onClick={() => setIsQRDialogOpen(true)}
          size="small"
          aria-label="Show QR Code"
        >
          <QrCode />
        </IconButton>
      </LeftButtonWrapper>
      <RightButtonWrapper>
        <IconButton
          onClick={copyToClipboard}
          size="small"
          aria-label="Copy to clipboard"
        >
          <ContentCopy />
        </IconButton>
      </RightButtonWrapper>
      <Dialog
        open={isQRDialogOpen}
        onClose={() => setIsQRDialogOpen(false)}
        aria-labelledby="qr-code-dialog-title"
      >
        <DialogTitle id="qr-code-dialog-title">QR Code</DialogTitle>
        <DialogContent>
          <Typography variant="body1" align="center" gutterBottom>
            {text}
          </Typography>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <QRCodeSVG value={text} size={256} />
          </div>
        </DialogContent>
      </Dialog>
      <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </div>
  )
}