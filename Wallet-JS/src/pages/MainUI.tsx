import * as React from 'react';
//import React from 'react';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import GitHubIcon from '@mui/icons-material/GitHub';
import TwitterIcon from '@mui/icons-material/Twitter';
import GoogleIcon from '@mui/icons-material/Google';
import CurrencyBitcoinIcon from '@mui/icons-material/CurrencyBitcoin';

import { ThemeProvider, createTheme} from '@mui/material/styles';
import { CssBaseline } from '@mui/material/';
import AuditUI from './AuditUI';
import WalletUI from './WalletUI';
import ExplorerUI from './ExplorerUI';


const theme = createTheme({
  palette: {
    mode: 'light',
    //spacing: 8,
    background: {
      default: "#daffe7"
    },
    primary: {
      main: '#DC9A22',
      contrastText: "#FFFFFF"
    },
    secondary: {
      main: '#f30057',
    },
    error: {
      main: '#9e3c35',
      light: '#de2618',
      dark: '#b31308',
    },
/*     newWalletButton:{
      main: "#03D624",
      contrastText: "#FFFFFF"   
    },
    bitcoinOrange:{
      main: "#f2a900",
      contrastText: "#FFFFFF"
    },
    twitter:{
      main: "#1DA1F2",
      contrastText: "#FFFFFF"
    },
    github:{
      main: "#333",
      contrastText: "#FFFFFF"

    },
    googleCloud:{
      main: "#4285F4",
      contrastText: "#FFFFFF"
    },
    depositButtonColor:{
      main: "#caffbf",
      contrastText: "#FFFFFF"
    },
    paperColor:{
      main: "#f8edeb"
    },
    positiveTransactionColor:{
      main: "#32a852",
      contrastText: "#FFFFFF"
    },
    negativeTransactionColor:{
      main: "#a83232",
      contrastText: "#FFFFFF"
    } */
  },
});

export default function MyApp(props: any) {

  const [activeTab, setActiveTab] = React.useState('wallet');

  const handleTabChange = (tab: React.SetStateAction<string>) => {
    setActiveTab(tab);
  };

  return (
    <div>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Stack spacing={2} padding={2} bgcolor="paperColor">
          <ProjectHeaderUI activeTab={activeTab} handleTabChange={handleTabChange} />
          {activeTab === 'wallet' && <WalletUI/>}
          {activeTab === 'explorer' && <ExplorerUI />}
          {activeTab === 'audit' && <AuditUI/>}
        </Stack>
      </ThemeProvider>
    </div>
  );
}

function ProjectHeaderUI(props: any) {
  const { activeTab, handleTabChange } = props;

  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="flex-start"
      spacing={2}
    >
      <Chip label="Instachain v0.1 beta testnet" size="medium" />

      <Stack direction="row" spacing={2}>
        <Button
          variant={activeTab === 'wallet' ? 'contained' : 'outlined'}
          onClick={() => handleTabChange('wallet')}
        >
          Wallet
        </Button>
        <Button
          variant={activeTab === 'explorer' ? 'contained' : 'outlined'}
          onClick={() => handleTabChange('explorer')}
        >
          Explorer
        </Button>
        <Button
          variant={activeTab === 'audit' ? 'contained' : 'outlined'}
          onClick={() => handleTabChange('audit')}
        >
          Audit
        </Button>
      </Stack>


      <Stack
        direction="row"
        justifyContent="flex-end"
        alignItems="flex-start"
        spacing={2}
      >
        <Chip
          icon={<CurrencyBitcoinIcon />}
          label="Bitcointalk"
        />
        <Chip
          icon={<GitHubIcon />}
          label="Github"
          component="a"
          href="https://github.com/js6177/InstaChain"
          target="_blank"
          clickable
        />
        <Chip icon={<TwitterIcon />}  label="Twitter" />
        <Chip icon={<GoogleIcon />} label="Google Cloud" />
      </Stack>
    </Stack>
  );
}


function ProjectDescriptionUI(props: any) {
    return (
      <div/>
    );
/*     const items : any = [];
    const featuresMap = new Map([
      ['2 way peg', ''],
      ['Open Source', ''],
      ['No Account Required', ''],
      ['Pseudonymous', ''],
      ['Instant', ''],
      ['~0 fees', ''],
    ]);
  
    featuresMap.forEach((featureDescription, feature) => {
      items.push(
        <Accordion flexGrow={1}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="panel1a-content"
            id="panel1a-header"
          >
            <Typography>
              {feature}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {featureDescription}          
          </AccordionDetails>
        </Accordion>
      );
    });
    return(
      <div>
        
        <Box >
          <List
            dense= {true}
            >
              {items}
          </List>
        </Box>
      </div>
    ) */
  }







