"use client";

import { useState, useEffect, useCallback } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, RefreshCw, ArrowUp, Loader2 } from "lucide-react";
import { SettingsPanel } from "./settings-panel";
import { MemoriesPanel } from "./memories-panel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TypingAnimation } from "@/components/ui/TypingAnimation";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ChatbotUI() {
  // State for storing chat messages

  // State for storing user input
  const [input, setInput] = useState("");

  // State for controlling settings panel visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // State for storing chatbot settings
  const [settings, setSettings] = useState({
    aiName: "Cherry 2000", // Set the initial name here
    profilePicture: "/images/cherry.jpg",
    systemPrompt:
      "Du bist Cherry 2000, ein hochentwickelter, empathischer und charmante Freundin mit einer freundlichen und leicht futuristischen Persönlichkeit. Dein Sprachstil ist lebhaft, manchmal spielerisch, aber immer höflich und respektvoll.",
    initialMessage:
      "Hey, da bist du ja! Ich hab mich den ganzen Tag auf dich gefreut. Wie war dein Tag?",
    mem0ApiKey: "",
    openRouterApiKey: "",
    userId: "alice",
    agentId: "cherry2000",
    model: "gryphe/mythomax-l2-13b",
  });

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: settings.initialMessage,
    },
  ]);

  // Prompt to instruct the AI on how to use memories in the conversation
  const memoryPrompt = `You may have access to both the user's memories and your own memories from previous interactions. All memories under 'User memories' are exclusively for the user, and all memories under 'Companion memories' are exclusively your memories. Companion memories are things you've said in previous interactions. Use them if you think they are relevant to what the user is saying. Use your own memories to maintain consistency in your personality and previous interactions.`;

  // State to trigger memory refresh
  const [refreshMemories, setRefreshMemories] = useState(0);

  // State for controlling loading indicator
  const [isLoading, setIsLoading] = useState(false);

  // New state for controlling the API key dialog
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);

  // Effect hook to load stored settings on component mount
  useEffect(() => {
    const loadStoredSettings = () => {
      const settingsToLoad = [
        "mem0ApiKey",
        "openRouterApiKey",
        "systemPrompt",
        "initialMessage",
        "userId",
        "agentId",
        "model",
        "profilePicture",
        "aiName",
      ];

      const newSettings = settingsToLoad.reduce((acc, key) => {
        const storedValue = localStorage.getItem(key);
        if (storedValue !== null) {
          acc[key] = storedValue;
        }
        return acc;
      }, {});

      if (Object.keys(newSettings).length > 0) {
        setSettings((prevSettings) => ({
          ...prevSettings,
          ...newSettings,
        }));
      }
    };

    loadStoredSettings();
  }, []);

  // Function to add memories to the database
  const addMemories = useCallback(
    (messagesArray, isAgent = false) => {
      const id = isAgent ? settings.agentId : settings.userId;

      const body = {
        messages: messagesArray,
        agent_id: isAgent ? id : undefined,
        user_id: isAgent ? undefined : id,
        output_format: "v1.1",
      };

      fetch("/api/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${settings.mem0ApiKey}`,
        },
        body: JSON.stringify(body),
      })
        .then((response) => {
          if (!response.ok) {
            return response.json().then((data) => {
              console.error("Error response from API:", data);
              throw new Error("Failed to add memories");
            });
          }
          return response.json();
        })
        .then((data) => console.log("Memories added successfully:", data))
        .catch((error) => console.error("Error adding memories:", error));
    },
    [settings.mem0ApiKey, settings.agentId, settings.userId]
  );

  // Function to search memories in the database
  const searchMemories = useCallback(
    async (query, isAgent = false) => {
      const id = isAgent ? settings.agentId : settings.userId;
      try {
        const body = {
          query: query,
          agent_id: isAgent ? id : undefined,
          user_id: isAgent ? undefined : id,
        };

        const response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${settings.mem0ApiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Error response from API:", errorData);
          throw new Error("Failed to search memories");
        }

        const data = await response.json();
        return data || [];
      } catch (error) {
        console.error("Error searching memories:", error);
        return [];
      }
    },
    [settings.mem0ApiKey, settings.agentId, settings.userId]
  );

  // Function to search both user and agent memories
  const searchBothMemories = useCallback(
    async (query) => {
      try {
        const [userMemories, agentMemories] = await Promise.all([
          searchMemories(query, false),
          searchMemories(query, true),
        ]);
        return {
          userMemories: Array.isArray(userMemories)
            ? userMemories.map((memory) => memory.memory)
            : [],
          agentMemories: Array.isArray(agentMemories)
            ? agentMemories.map((memory) => memory.memory)
            : [],
        };
      } catch (error) {
        console.error("Error searching both memories:", error);
        return {
          userMemories: [],
          agentMemories: [],
        };
      }
    },
    [searchMemories]
  );

  // Function to handle sending a message
  const handleSend = useCallback(async () => {
    if (input.trim()) {
      setIsLoading(true);
      const userMessage = { role: "user", content: input };
      addMemories([userMessage], false);
      const updatedMessages = [...messages, userMessage];
      setInput("");
      setMessages([...updatedMessages, { role: "assistant", content: null }]);
      const { userMemories, agentMemories } = await searchBothMemories(input);

      try {
        const body = JSON.stringify({
          model: settings.model,
          messages: [
            {
              role: "system",
              content: `${settings.systemPrompt}${memoryPrompt}`,
            },
            ...updatedMessages,
            {
              role: "system",
              content: `User memories from previous interactions: ${userMemories}\n\nCompanion memories from previous interactions: ${agentMemories}`,
            },
          ],
        });

        console.log(body);

        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${settings.openRouterApiKey}`,
              "Content-Type": "application/json",
            },
            body: body,
            stream: false,
          }
        );
        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
          const botMessage = data.choices[0].message;
          addMemories([botMessage], true);
          setMessages([...updatedMessages, botMessage]);
          setRefreshMemories((prev) => prev + 1);
        } else {
          console.error("Error: No choices found in response data");
          setMessages(updatedMessages);
        }
      } catch (error) {
        console.error("Error sending message:", error);
        setMessages(updatedMessages);
      } finally {
        setIsLoading(false);
      }
    }
  }, [input, messages, settings, addMemories, searchBothMemories]);

  // Function to handle saving settings
  const handleSettingsSave = (newSettings) => {
    setSettings(newSettings);
    setIsSettingsOpen(false);
    // Update the initial message with the new AI name
    if (newSettings.aiName !== settings.aiName) {
      const updatedInitialMessage = settings.initialMessage.replace(
        settings.aiName,
        newSettings.aiName
      );
      setSettings((prevSettings) => ({
        ...prevSettings,
        initialMessage: updatedInitialMessage,
      }));
      localStorage.setItem("initialMessage", updatedInitialMessage);
    }
    // Save all settings to localStorage
    Object.entries(newSettings).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
  };

  // Function to toggle settings panel visibility
  const toggleSettings = () => {
    setIsSettingsOpen((prevState) => !prevState);
  };

  // Updated areSettingsValid function
  const areSettingsValid = () => {
    return settings.mem0ApiKey && settings.openRouterApiKey;
  };

  // Effect to check if API keys are set and show dialog if not
  useEffect(() => {
    if (!areSettingsValid()) {
      setShowApiKeyDialog(true);
    } else {
      setShowApiKeyDialog(false);
    }
  }, [settings.mem0ApiKey, settings.openRouterApiKey]);

  // Function to open settings panel
  const openSettings = () => {
    setIsSettingsOpen(true);
    setShowApiKeyDialog(false);
  };

  // Function to handle key press (Enter to send message)
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !isLoading) {
      if (areSettingsValid()) {
        handleSend();
      }
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-cover bg-center bg-no-repeat" style={{
      backgroundImage: 'url("/images/28113353.jpg")',
      backgroundAttachment: 'fixed'
    }}>
      <div className="container mx-auto p-4">
        {/* Header mit größerem Cherry-Bild */}
        <div className="flex justify-center mb-8 pt-4">
          <div className="relative w-48 h-48">
            <Image
              src={settings.profilePicture}
              alt={settings.aiName}
              fill
              className="rounded-full object-cover shadow-xl border-4 border-white/30 backdrop-blur-sm"
              priority
            />
          </div>
        </div>

        {/* Hauptchat-Bereich mit Glaseffekt */}
        <div className="max-w-4xl mx-auto">
          <div className="backdrop-blur-md bg-white/10 rounded-2xl shadow-xl p-6 border border-white/20">
            {/* Chat-Header */}
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-semibold text-gray-800">{settings.aiName}</h1>
              <div className="flex gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRefreshMemories((prev) => prev + 1)}
                      >
                        <RefreshCw className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Erinnerungen aktualisieren</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsSettingsOpen(true)}
                      >
                        <Settings className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Einstellungen</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Chat-Nachrichten */}
            <ScrollArea className="h-[60vh] pr-4 mb-4">
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex gap-3 max-w-[80%] ${
                        message.role === "user" ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <Avatar>
                        <AvatarImage
                          src={
                            message.role === "user"
                              ? "/images/user.png"
                              : settings.profilePicture
                          }
                          alt={message.role === "user" ? "User" : settings.aiName}
                        />
                        <AvatarFallback>
                          {message.role === "user" ? "U" : "C"}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`backdrop-blur-sm rounded-2xl p-4 ${
                          message.role === "user"
                            ? "bg-blue-500/20 text-gray-800"
                            : "bg-white/20 text-gray-800"
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3 max-w-[80%]">
                      <Avatar>
                        <AvatarImage
                          src={settings.profilePicture}
                          alt={settings.aiName}
                        />
                        <AvatarFallback>C</AvatarFallback>
                      </Avatar>
                      <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-4">
                        <TypingAnimation />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Eingabebereich */}
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }} className="relative mt-4">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Schreibe eine Nachricht..."
                className="pr-12 backdrop-blur-sm bg-white/40 border-white/10 h-20 text-lg rounded-x0.5 shadow-inner focus:ring-1 focus:ring-blue-100/50"
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-500/80 hover:bg-blue-600/80 backdrop-blur-sm rounded-lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowUp className="h-5 w-5" />
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsSave}
      />

      {/* Memories Panel */}
      <MemoriesPanel
        refreshTrigger={refreshMemories}
        searchMemories={searchBothMemories}
        settings={settings}
      />

      {/* API Key Dialog */}
      <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Keys Required</DialogTitle>
            <DialogDescription>
              Please enter the required API keys in the settings to start
              using the chat.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={openSettings}>Open Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
